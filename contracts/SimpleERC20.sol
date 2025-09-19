// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @title SimpleERC20 - minimal ERC20 token for event testing
/// @author
/// @notice Very small ERC20 implementation intended for testnets / local testing
contract SimpleERC20 {
    string public name;
    string public symbol;
    uint8 public immutable decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;

    /// @notice Emitted when `value` tokens are moved from `from` to `to`.
    event Transfer(address indexed from, address indexed to, uint256 value);

    /// @notice Emitted when the allowance of a `spender` for an `owner` is set.
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /// @param _name Token name
    /// @param _symbol Token symbol
    /// @param initialSupply Initial supply minted to deployer (in whole tokens; multiplied by 10**decimals)
    constructor(string memory _name, string memory _symbol, uint256 initialSupply) {
        name = _name;
        symbol = _symbol;
        uint256 supply = initialSupply * (10 ** uint256(decimals));
        totalSupply = supply;
        _balances[msg.sender] = supply;
        emit Transfer(address(0), msg.sender, supply);
    }

    /// @notice balance of `account`
    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    /// @notice transfer tokens to `to`
    function transfer(address to, uint256 amount) external returns (bool) {
        address owner = msg.sender;
        _transfer(owner, to, amount);
        return true;
    }

    /// @notice allowance from owner to spender
    function allowance(address owner, address spender) external view returns (uint256) {
        return _allowances[owner][spender];
    }

    /// @notice approve `spender` to spend `amount`
    function approve(address spender, uint256 amount) external returns (bool) {
        _allowances[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    /// @notice transfer from `from` to `to` using allowance
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 currentAllowance = _allowances[from][msg.sender];
        require(currentAllowance >= amount, "ERC20: transfer amount exceeds allowance");
        _allowances[from][msg.sender] = currentAllowance - amount;
        _transfer(from, to, amount);
        emit Approval(from, msg.sender, _allowances[from][msg.sender]);
        return true;
    }

    /// @dev internal transfer helper
    function _transfer(address from, address to, uint256 amount) internal {
        require(from != address(0), "ERC20: transfer from zero");
        require(to != address(0), "ERC20: transfer to zero");
        uint256 fromBal = _balances[from];
        require(fromBal >= amount, "ERC20: transfer amount exceeds balance");
        _balances[from] = fromBal - amount;
        _balances[to] += amount;
        emit Transfer(from, to, amount);
    }
}
