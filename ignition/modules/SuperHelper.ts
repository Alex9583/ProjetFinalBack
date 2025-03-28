import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";


const SuperHelperModule = buildModule("SuperHelperModule", (m) => {

    const superHelper = m.contract("SuperHelper");

    return { superHelper };
});

export default SuperHelperModule;
