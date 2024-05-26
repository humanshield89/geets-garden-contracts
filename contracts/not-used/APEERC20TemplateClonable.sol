// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
// ownable
import "@openzeppelin/contracts/access/Ownable.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";

// Uncomment this line to use console.log
// import "hardhat/console.sol";

contract APEERC20TemplateClonable is ERC20Upgradeable {
    uint256 public maxWallet;
    address public immutable pairAddress;
    address public immutable curve;
    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }

    modifier onlyCurve() {
        require(msg.sender == curve, "Caller is not curve");
        _;
    }

    constructor(address _unifactory, address _weth) {
        pairAddress = IUniswapV2Factory(_unifactory).createPair(
            address(this),
            _weth
        );
        curve = msg.sender;
    }

    function initialze(
        string calldata name_,
        string calldata symbol_,
        uint256 initialSupply_,
        uint256 maxWallet_
    ) external onlyCurve {
        __ERC20_init(name_, symbol_);

        _mint(msg.sender, initialSupply_);
        maxWallet = maxWallet_;
        owner = msg.sender;
    }

    function setmaxWallet(uint256 _maxWallet) external onlyOwner {
        maxWallet = _maxWallet;
    }

    /**
     * @dev Transfers a `value` amount of tokens from `from` to `to`, or alternatively mints (or burns) if `from`
     * (or `to`) is the zero address. All customizations to transfers, mints, and burns should be done by overriding
     * this function.
     *
     * Emits a {Transfer} event.
     */
    function _update(
        address from,
        address to,
        uint256 value
    ) internal virtual override {
        super._update(from, to, value);

        // if owner is not address 0 means this is not launched
        if (owner != address(0)) {
            // can't sen tokens to pair before launch
            require(
                to != pairAddress || from == owner,
                "APEERC20Template: Can't send tokens to pair before launch"
            );

            // max wallet
            if (maxWallet > 0) {
                require(
                    balanceOf(to) <= maxWallet,
                    "APEERC20Template: Max wallet limit exceeded"
                );
            }
        }
    }

    function renounceOwnership() external onlyOwner {
        owner = address(0);
    }
}
