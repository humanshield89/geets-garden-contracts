// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";

contract GEETSGardenToken is ERC20, Ownable {
    uint256 public maxWallet;
    address public immutable pairAddress;

    constructor(
        address _unifactory,
        address _weth,
        string memory name_,
        string memory symbol_,
        uint256 initialSupply_,
        uint256 maxWallet_
    ) ERC20(name_, symbol_) Ownable(msg.sender) {
        _mint(msg.sender, initialSupply_);
        maxWallet = maxWallet_;
        pairAddress = IUniswapV2Factory(_unifactory).createPair(
            address(this),
            _weth
        );
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
        if (owner() != address(0)) {
            // can't sen tokens to pair before launch
            require(
                to != pairAddress || from == owner(),
                "GEETSGardenToken: Can't send tokens to pair before launch"
            );

            // max wallet
            if (maxWallet > 0 && to != owner()) {
                require(
                    balanceOf(to) <= maxWallet,
                    "GEETSGardenToken: Max wallet limit exceeded"
                );
            }
        }
    }
}
