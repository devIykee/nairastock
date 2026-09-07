// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "./interfaces/IERC20.sol";

/// @notice Minimal ERC20 with a faucet-style mint, standing in for tokens that
/// exist on Base mainnet but not on testnets:
///   - cNGN, the naira stablecoin issued by the Africa Stablecoin Consortium
///   - the Coinbase B20 tokenized stocks (AAPLc / NVDAc / METAc / GOOGLc)
/// Decimals are configurable so each mock matches its mainnet counterpart, which
/// keeps every amount conversion in the API identical across environments.
contract MockERC20 is IERC20 {
    string private _name;
    string private _symbol;
    uint8 private immutable _decimals;

    uint256 public totalSupply;
    address public minter;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    error NotMinter();
    error InsufficientBalance(uint256 available, uint256 required);
    error InsufficientAllowance(uint256 available, uint256 required);
    error ZeroAddress();

    event MinterChanged(address indexed previousMinter, address indexed newMinter);

    constructor(string memory name_, string memory symbol_, uint8 decimals_, address minter_) {
        _name = name_;
        _symbol = symbol_;
        _decimals = decimals_;
        minter = minter_ == address(0) ? msg.sender : minter_;
    }

    function name() external view returns (string memory) {
        return _name;
    }

    function symbol() external view returns (string memory) {
        return _symbol;
    }

    function decimals() external view returns (uint8) {
        return _decimals;
    }

    modifier onlyMinter() {
        if (msg.sender != minter) revert NotMinter();
        _;
    }

    /// @dev The API's faucet wallet is the minter; this is how a mocked naira
    /// deposit becomes cNGN in the user's own wallet.
    function mint(address to, uint256 amount) external onlyMinter {
        if (to == address(0)) revert ZeroAddress();
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    /// @dev Used by the mocked naira withdrawal: cNGN returns to the issuer and
    /// leaves circulation, mirroring an off-ramp partner burning on payout.
    function burn(uint256 amount) external {
        uint256 balance = balanceOf[msg.sender];
        if (balance < amount) revert InsufficientBalance(balance, amount);
        balanceOf[msg.sender] = balance - amount;
        totalSupply -= amount;
        emit Transfer(msg.sender, address(0), amount);
    }

    function setMinter(address newMinter) external onlyMinter {
        if (newMinter == address(0)) revert ZeroAddress();
        emit MinterChanged(minter, newMinter);
        minter = newMinter;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            if (allowed < value) revert InsufficientAllowance(allowed, value);
            allowance[from][msg.sender] = allowed - value;
        }
        _transfer(from, to, value);
        return true;
    }

    function _transfer(address from, address to, uint256 value) private {
        if (to == address(0)) revert ZeroAddress();
        uint256 balance = balanceOf[from];
        if (balance < value) revert InsufficientBalance(balance, value);
        balanceOf[from] = balance - value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }
}
