// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

/// @title Warehouse actuator payment trigger
/// @notice Records an on-chain activation trigger after receiving exactly 1 PAS.
/// @dev This contract does not control hardware or report physical actuator state.
/// @custom:cdm @industrial/actuator
contract Actuator {
    uint256 public triggerNonce;
    uint256 public constant PRICE = 1 ether;
    uint256 public constant ACTIVATION_SECONDS = 60;

    event Activated(
        address indexed payer,
        uint256 indexed nonce,
        uint256 value,
        uint256 timestamp
    );

    function trigger() external payable {
        require(msg.value == PRICE, "exactly 1 PAS required");

        triggerNonce += 1;

        emit Activated(
            msg.sender,
            triggerNonce,
            msg.value,
            block.timestamp
        );
    }
}
