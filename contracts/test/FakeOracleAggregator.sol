// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

contract FakeOracleAggregator is AggregatorV3Interface {
    uint256 private _latestPrice = 30000000000;

    function decimals() external pure override returns (uint8) {
        return 7;
    }

    function description() external pure override returns (string memory) {
        return "FakeOracleAggregator";
    }

    function version() external pure override returns (uint256) {
        return 1;
    }

    function setRound(uint256 price) external {
        _latestPrice = price;
    }

    function getRoundData(
        uint80
    )
        external
        pure
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (1, 30000000000, 0, 0, 0);
    }

    function latestRoundData()
        external
        pure
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (1, 30000000000, 0, 0, 0);
    }
}
