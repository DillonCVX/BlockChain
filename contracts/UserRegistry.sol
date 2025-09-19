// contracts/UserRegistry.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract UserRegistry {
    struct User {
        address wallet;
        string username;
    }

    mapping(address => User) public users;

    event UserRegistered(address user, string username);

    function registerUser(string memory _username) public {
        require(users[msg.sender].wallet == address(0), "Already registered");
        users[msg.sender] = User(msg.sender, _username);
        emit UserRegistered(msg.sender, _username);
    }

    function getUser(address _wallet) public view returns (string memory) {
        return users[_wallet].username;
    }
}
