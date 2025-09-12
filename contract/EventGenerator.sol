// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @title EventGenerator - emits multiple types of events for scanner testing
/// @notice Contains indexed and non-indexed event params, arrays (emitted as bytes), and numeric/logical events
contract EventGenerator {
    /// @notice simple event with indexed address and numeric id
    event ItemCreated(address indexed creator, uint256 indexed id, string name);

    /// @notice event with non-indexed payload
    event DataStored(uint256 id, bytes data);

    /// @notice event with multiple indexed fields
    event ComplexEvent(address indexed a, address indexed b, uint256 indexed id, uint256 value);

    /// @notice event showing boolean and string
    event StatusUpdated(uint256 indexed id, bool ok, string message);

    uint256 private _counter;

    constructor() {
        _counter = 0;
    }

    /// @notice create an item and emit ItemCreated
    function createItem(string calldata name) external returns (uint256) {
        _counter += 1;
        uint256 id = _counter;
        emit ItemCreated(msg.sender, id, name);
        return id;
    }

    /// @notice store arbitrary bytes and emit DataStored
    function storeData(uint256 id, bytes calldata data) external {
        emit DataStored(id, data);
    }

    /// @notice emit ComplexEvent between two addresses with a value
    function triggerComplex(address other, uint256 value) external {
        _counter += 1;
        uint256 id = _counter;
        emit ComplexEvent(msg.sender, other, id, value);
    }

    /// @notice emit StatusUpdated
    function updateStatus(uint256 id, bool ok, string calldata message) external {
        emit StatusUpdated(id, ok, message);
    }
}
