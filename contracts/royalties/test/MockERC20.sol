// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.10;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor(
        string memory name_,
        string memory symbol_,
        address[] memory initialRecipients
    ) ERC20(name_, symbol_) {
        for (uint256 i = 0; i < initialRecipients.length; i++) {
            _mint(initialRecipients[i], 1000000000000000000000);
            _approve(initialRecipients[i], initialRecipients[i], 1000000000000000000000);
        }
    }
}
