// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract HelperToken is ERC20, Ownable {
    uint8 public constant DECIMALS = 2;
    uint256 public constant ONE_TOKEN = 10 ** DECIMALS;

    constructor() ERC20("HELPER", "HELP") Ownable(msg.sender) {
        _mint(msg.sender, 1_000_000_000 * ONE_TOKEN);
    }

    function decimals() override public pure returns(uint8) {
        return DECIMALS;
    }
}
