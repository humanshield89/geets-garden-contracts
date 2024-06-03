// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./JEETSGardenTokenAVAX.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IJoe.sol";
import "@openzeppelin/contracts/utils/Create2.sol";

import "hardhat/console.sol";

uint256 constant INITIAL_SUPPLY = 1_000_000_000 ether;
uint256 constant AUTO_LAUNCH_MC = 59_000;
uint256 constant DISABLE_MAXWALLET_MC = 20_000;

uint256 constant MAX_FEE_BPS = 1000; // 10%

struct VirtualLiquidity {
    uint256 reserve0;
    uint256 reserve1;
    uint256 k;
    bool launched;
}

contract BoundingCurveStorageAVAX is OwnableUpgradeable {
    ///@custom:oz-upgrades-unsafe-allow state-variable-immutable
    uint256 public immutable minVLP;
    using SafeERC20 for IERC20;

    // uint256 public vLPToAutoLaunch;

    // token => [tokenReserves, virtualReserves, k]
    mapping(address => VirtualLiquidity) public virtualLiquidity;

    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    uint256 public immutable oracleDecimals;
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    AggregatorV3Interface public immutable dataFeed; // ETH Price
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IJoeFactory public immutable uniFactory;
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IJoeRouter02 public immutable uniRouter;
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address public immutable WETH;

    uint256 public buyFeeBps;
    uint256 public sellFeeBps;
    uint256 public listingFeeBps;
    address public feeTo;

    mapping(address => uint256) public nounces;

    event FeeToSet(address feeTo);
    event TokenCreated(
        address token,
        address owner,
        uint256 supply,
        string name,
        string symbol,
        uint256 maxWallet
    );
    event Trade(
        address trader,
        bool isBuy,
        address token,
        uint256 amountIn,
        uint256 amountOut,
        uint256 reserve0,
        uint256 reserve1,
        uint256 timestamp
    );

    event TokenLaunched(address token);

    // these won't likely change across implementations
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(
        AggregatorV3Interface dataFeed_,
        uint256 minVirtualLP_,
        IJoeFactory uniFactory_,
        IJoeRouter02 uniRouter_
    ) {
        dataFeed = dataFeed_;
        oracleDecimals = dataFeed_.decimals();
        minVLP = minVirtualLP_;
        uniFactory = uniFactory_;
        uniRouter = uniRouter_;
        require(minVirtualLP_ > 0, "minVLP must be greater than 0");
        WETH = uniRouter_.WAVAX();
    }

    modifier onlyNotLaunched(address token_) {
        require(!virtualLiquidity[token_].launched, "Token already launched");
        _;
    }

    function buyToken(
        address token_,
        uint256 minAmountOut_
    ) external payable onlyNotLaunched(token_) {
        require(msg.value > 0, "ETH value must be greater than 0");
        uint256 amountIn_ = msg.value;
        _buyToken(token_, amountIn_, minAmountOut_, msg.sender);
    }

    function sellToken(
        address token_,
        uint256 amountIn_,
        uint256 minAmountOut_
    ) external onlyNotLaunched(token_) {
        require(amountIn_ > 0, "Amount must be greater than 0");
        // no tax on our tokens so no need to check if received the exact amount
        IERC20(token_).safeTransferFrom(msg.sender, address(this), amountIn_);

        uint256 amountOut = getEthAmountOut(token_, amountIn_);

        uint256 netOut = amountOut - (amountOut * sellFeeBps) / 10000;
        require(netOut >= minAmountOut_, "Slippage");

        virtualLiquidity[token_].reserve0 += amountIn_;
        virtualLiquidity[token_].reserve1 -= amountOut;

        (bool success, ) = payable(msg.sender).call{value: netOut}("");
        require(success, "Transfer failed 1");
        (success, ) = payable(feeTo).call{value: amountOut - netOut}("");
        require(success, "Transfer failed 2");

        emit Trade(
            msg.sender,
            false,
            token_,
            amountIn_,
            amountOut,
            virtualLiquidity[token_].reserve0,
            virtualLiquidity[token_].reserve1,
            block.timestamp
        );

        _checkAndList(token_, amountOut, amountIn_);
    }

    function createNewToken(
        string memory name_,
        string memory symbol_,
        uint256 maxWallet_
    ) public payable {
        address newToken = Create2.deploy(
            0,
            keccak256(abi.encodePacked(msg.sender, nounces[msg.sender])),
            abi.encodePacked(
                type(JEETSGardenTokenAVAX).creationCode,
                abi.encode(
                    address(uniFactory),
                    WETH,
                    name_,
                    symbol_,
                    INITIAL_SUPPLY,
                    maxWallet_
                )
            )
        );

        // it automatically mints the total supply to this contract
        virtualLiquidity[(newToken)].reserve0 = INITIAL_SUPPLY;
        virtualLiquidity[(newToken)].k = minVLP * INITIAL_SUPPLY;

        emit TokenCreated(
            (newToken),
            msg.sender,
            INITIAL_SUPPLY,
            name_,
            symbol_,
            maxWallet_
        );

        // deployer wanted to ape first
        if (msg.value > 0) {
            _buyToken(address(newToken), msg.value, 0, msg.sender);
        }

        // approve router to spend the token
        // we approve here so the owner eats the cost and not a buyer later down the line
        IERC20(newToken).approve(address(uniRouter), type(uint256).max);
    }

    function setFeeTo(address feeTo_) external onlyOwner {
        require(feeTo_ != address(0), "FeeTo cannot be 0");
        // not the same as the current feeTo
        require(feeTo_ != feeTo, "Redundant setFeeTo call");

        feeTo = feeTo_;
        emit FeeToSet(feeTo_);
    }

    function setBuyFeeBps(uint256 buyFeeBps_) external onlyOwner {
        require(buyFeeBps_ != buyFeeBps, "Redundant setBuyFeeBps call");
        _setBuyFeeBps(buyFeeBps_);
    }

    function setSellFeeBps(uint256 sellFeeBps_) external onlyOwner {
        require(sellFeeBps_ != sellFeeBps, "Redundant setSellFeeBps call");
        _setSellFeeBps(sellFeeBps_);
    }

    function setListingFeeBps(uint256 listingFeeBps_) external onlyOwner {
        require(
            listingFeeBps_ != listingFeeBps,
            "Redundant setListingFeeBps call"
        );
        _setListingFeeBps(listingFeeBps_);
    }

    function getTokenAmountOut(
        address token_,
        uint256 amountIn_
    ) public view returns (uint256) {
        uint256 numerator = virtualLiquidity[token_].reserve0 * amountIn_;
        uint256 denominator = virtualLiquidity[token_].reserve1 +
            minVLP +
            amountIn_;

        return numerator / denominator;
    }

    function getEthAmountOut(
        address token_,
        uint256 amountIn_
    ) public view returns (uint256) {
        uint256 numerator = (virtualLiquidity[token_].reserve1 + minVLP) *
            amountIn_;
        uint256 denominator = virtualLiquidity[token_].reserve0 + amountIn_;

        return numerator / denominator;
    }

    function getChainlinkDataFeedLatestAnswer() public view returns (int) {
        // prettier-ignore
        (
            /* uint80 roundID */,
            int answer,
            /*uint startedAt*/,
            /*uint timeStamp*/,
            /*uint80 answeredInRound*/
        ) = dataFeed.latestRoundData();
        return answer;
    }

    function __BoundingCurveStorage_init(
        address owner_,
        address feeTo_,
        uint256 buyFeeBps_,
        uint256 sellFeeBps_,
        uint256 listingFeeBps_
    ) public initializer {
        __Ownable_init(owner_);
        require(feeTo_ != address(0), "FeeTo cannot be 0");
        feeTo = feeTo_;

        _setBuyFeeBps(buyFeeBps_);

        _setSellFeeBps(sellFeeBps_);

        _setListingFeeBps(listingFeeBps_);
    }

    function _buyToken(
        address token_,
        uint256 amountIn_,
        uint256 minAmountOut_,
        address user_
    ) internal {
        uint256 netAmountIn = amountIn_ - (amountIn_ * buyFeeBps) / 10000;
        uint256 amountOut = getTokenAmountOut(token_, netAmountIn);
        require(amountOut >= minAmountOut_, "Slippage");

        virtualLiquidity[token_].reserve0 -= amountOut;
        virtualLiquidity[token_].reserve1 += netAmountIn;

        IERC20(token_).safeTransfer(user_, amountOut);

        (bool success, ) = payable(feeTo).call{value: amountIn_ - netAmountIn}(
            ""
        );
        require(success, "ETH Transfer failed");

        emit Trade(
            user_,
            true,
            token_,
            amountIn_,
            amountOut,
            virtualLiquidity[token_].reserve0,
            virtualLiquidity[token_].reserve1,
            block.timestamp
        );

        require(
            virtualLiquidity[token_].k <=
                virtualLiquidity[token_].reserve0 *
                    (virtualLiquidity[token_].reserve1 + minVLP),
            "K"
        );

        virtualLiquidity[token_].k =
            virtualLiquidity[token_].reserve0 *
            (virtualLiquidity[token_].reserve1 + minVLP);

        _checkAndList(token_, netAmountIn, amountOut);
    }

    function _checkAndList(
        address token_,
        uint256 amountIn_,
        uint256 amountOut_
    ) internal {
        uint256 currentTokenInEthPrice = (amountIn_ * 10 ** 18) / amountOut_;

        uint256 ethUsdPrice = uint256(getChainlinkDataFeedLatestAnswer());

        uint256 currentToeknUsdPrice = (currentTokenInEthPrice * ethUsdPrice) /
            10 ** 18;

        uint256 marketCap = (currentToeknUsdPrice * INITIAL_SUPPLY) / 10 ** 18;

        if (
            marketCap >= DISABLE_MAXWALLET_MC * 10 ** oracleDecimals &&
            JEETSGardenTokenAVAX(token_).maxWallet() > 0
        ) {
            JEETSGardenTokenAVAX(token_).setmaxWallet(0);
        }

        if (marketCap >= AUTO_LAUNCH_MC * 10 ** oracleDecimals) {
            _launchToken(token_);
        }
    }

    function _setBuyFeeBps(uint256 buyFeeBps_) internal {
        require(buyFeeBps_ <= MAX_FEE_BPS, "Buy fee too high");
        buyFeeBps = buyFeeBps_;
    }

    function _setSellFeeBps(uint256 sellFeeBps_) internal {
        require(sellFeeBps_ <= MAX_FEE_BPS, "Sell fee too high");
        sellFeeBps = sellFeeBps_;
    }

    function _setListingFeeBps(uint256 listingFeeBps_) internal {
        require(listingFeeBps_ <= MAX_FEE_BPS, "Listing fee too high");
        listingFeeBps = listingFeeBps_;
    }

    function _launchToken(address token_) internal {
        require(!virtualLiquidity[token_].launched, "Token already launched");
        virtualLiquidity[token_].launched = true;

        // disable max wallet after launch
        JEETSGardenTokenAVAX(token_).renounceOwnership();

        uint256 reserves0 = virtualLiquidity[token_].reserve0;
        uint256 reserves1 = virtualLiquidity[token_].reserve1;

        // basically we have 1eth in vlp and we want to remove minVLP worth of tokens
        uint256 amountToRemove = (reserves0 * minVLP) / (reserves1 + minVLP);
        reserves0 -= amountToRemove;
        // burn amountToRemove worth of tokens
        IERC20(token_).safeTransfer(address(0xdead), amountToRemove);

        uint256 fee0 = (reserves0 * listingFeeBps) / 10000;
        uint256 fee1 = (reserves1 * listingFeeBps) / 10000;

        // transfer the fees to feeTo
        IERC20(token_).safeTransfer(feeTo, fee0);
        // transfer eth
        (bool success, ) = payable(feeTo).call{value: fee1}("");
        require(success, "ETH Transfer failed");

        // remove and burn minVLP worth of tokens to keep the price on lp = price here

        // safe to create LP from current token reserves
        // create lp with eth
        (, , uint liquidity) = uniRouter.addLiquidityAVAX{
            value: reserves1 - fee1
        }(
            token_,
            reserves0 - fee0,
            0, //  There is way someone else sent the token to the contract
            0, //  so we don't need to worry about slippage
            address(this),
            block.timestamp + 1
        );
        require(liquidity > 0, "Failed to create LP");

        // burn the lp by sending them to dead address
        IJoePair pair = IJoePair(uniFactory.getPair(token_, WETH));

        // burn the LP
        pair.transfer(address(0xdead), liquidity);

        // set reserves to 0
        virtualLiquidity[token_].reserve0 = 0;
        virtualLiquidity[token_].reserve1 = 0;

        emit TokenLaunched(token_);
    }

    uint256[50] private __gap;
}
