// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @title TokenEmitter - lightweight contract that emits Transfer and Ping events
/// @notice Useful for generating both standard Transfer events and arbitrary Ping events for scanners
contract TokenEmitter {
    string public name = "EmitterToken";
    mapping(address => uint256) public balance;

    /// @notice Emitted when tokens are transferred
    event Transfer(address indexed from, address indexed to, uint256 value);

    /// @notice Emitted when someone calls ping with a message
    event Ping(address indexed sender, string message);

    /// @notice Simple constructor mints initial balance to deployer
    constructor() {
        balance[msg.sender] = 1000 * (10 ** 18);
    }

    /// @notice Transfer tokens to `to` and emit Transfer event
    function transfer(address to, uint256 amount) public returns(bool) {
        require(balance[msg.sender] >= amount, "insufficient");
        balance[msg.sender] -= amount;
        balance[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    /// @notice Emit Ping event with a message (no state change)
    function ping(string calldata message) public {
        emit Ping(msg.sender, message);
    }

    /// @notice Helper to check balance
    function balanceOf(address addr) external view returns(uint256) {
        return balance[addr];
    }
}
