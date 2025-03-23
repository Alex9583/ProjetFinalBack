// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract HelperToken is ERC20, Ownable {
    uint8 private constant DECIMALS = 2;
    uint256 private constant ONE_TOKEN = 10 ** DECIMALS;

    constructor() ERC20("HELPER", "HELP") Ownable(msg.sender) {
        _mint(address(this), 1_000_000_000 * ONE_TOKEN);
    }

    function decimals() override public pure returns(uint8) {
        return DECIMALS;
    }

    function distributeToNewUser(address newUser) external onlyOwner {
        require(balanceOf(address(this)) >= 100 * ONE_TOKEN, "Not enough funds in the contract");
        _transfer(address(this), newUser, 100 * ONE_TOKEN);
    }
}
