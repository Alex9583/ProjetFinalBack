import {loadFixture} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import {expect} from "chai";
import hre from "hardhat";

describe("Token Helper Contract", function () {

    async function deployContractsFixture() {
        const [owner, user1, user2, other] = await hre.ethers.getSigners();

        const SuperHelper = await hre.ethers.getContractFactory("SuperHelper", owner);
        const superHelper = await SuperHelper.deploy();

        const helperTokenAddress = await superHelper.helperToken();
        const helperToken = await hre.ethers.getContractAt("HelperToken", helperTokenAddress, owner);

        return {superHelper, helperToken, owner, user1, user2, other};
    }

    describe("Token Helper", function () {
        it("Should deploy", async function () {
            const {superHelper, helperToken} = await loadFixture(deployContractsFixture);
            expect(superHelper).to.exist;
            expect(helperToken).to.exist;
        });

        it("Should use the decimal override function", async function () {
            const {helperToken} = await loadFixture(deployContractsFixture);
            expect(await helperToken.decimals()).to.equal(2);
        })
    })

});