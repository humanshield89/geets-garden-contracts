// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "./BoundingCurveStorage.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract BoundingCurveUpgradable is BoundingCurveStorage, UUPSUpgradeable {
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(
        AggregatorV3Interface dataFeed_,
        uint256 minVirtualLP_,
        IUniFactory uniFactory_,
        IUniswapV2Router02 uniRouter_
    ) BoundingCurveStorage(dataFeed_, minVirtualLP_, uniFactory_, uniRouter_) {}

    function initialize(
        address owner_,
        address feeTo_,
        uint256 buyFeeBps_,
        uint256 sellFeeBps_,
        uint256 listingFeeBps_
    ) public initializer {
        __BoundingCurveStorage_init(
            owner_,
            feeTo_,
            buyFeeBps_,
            sellFeeBps_,
            listingFeeBps_
        );
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
