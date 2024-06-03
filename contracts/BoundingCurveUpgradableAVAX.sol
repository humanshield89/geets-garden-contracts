// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "./BoundingCurveStorageAVAX.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract BoundingCurveUpgradableAVAX is
    BoundingCurveStorageAVAX,
    UUPSUpgradeable
{
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(
        AggregatorV3Interface dataFeed_,
        uint256 minVirtualLP_,
        IJoeFactory uniFactory_,
        IJoeRouter02 uniRouter_
    )
        BoundingCurveStorageAVAX(
            dataFeed_,
            minVirtualLP_,
            uniFactory_,
            uniRouter_
        )
    {}

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
