import {loadFixture, time} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import {expect} from "chai";
import hre from "hardhat";

describe("SuperHelper Contract", function () {

    async function deployContractsFixture() {
        const [owner, user1, user2, other] = await hre.ethers.getSigners();

        const SuperHelper = await hre.ethers.getContractFactory("SuperHelper", owner);
        const superHelper = await SuperHelper.deploy();

        const helperTokenAddress = await superHelper.helperToken();
        const helperToken = await hre.ethers.getContractAt("HelperToken", helperTokenAddress, owner);

        return {superHelper, helperToken, owner, user1, user2, other};
    }

    async function deployAndPrepareDepreciationFixture() {
        const {superHelper, helperToken,owner,  user1, user2} = await loadFixture(deployContractsFixture);
        const ONE_TOKEN = await helperToken.ONE_TOKEN();

        await superHelper.connect(owner).confirmKYCForUser(user1.address);
        await superHelper.connect(owner).confirmKYCForUser(user2.address);
        await superHelper.connect(user1).distributeToNewUser();
        await superHelper.connect(user2).distributeToNewUser();

        const ninetyDays = 90 * 24 * 60 * 60;
        const userDataBefore = await superHelper.users(user1.address);
        await time.increaseTo(userDataBefore.lastActivity + BigInt(ninetyDays));

        return {superHelper, helperToken, user1, user2, ONE_TOKEN};
    }

    async function createAndDisputeJobFixture() {
        const {superHelper, helperToken, owner, user1, user2} = await loadFixture(deployContractsFixture);
        const ONE_TOKEN = await helperToken.ONE_TOKEN();

        const rewardAmount = 50n * ONE_TOKEN;

        await superHelper.connect(owner).confirmKYCForUser(user1.address);
        await superHelper.connect(owner).confirmKYCForUser(user2.address);
        await superHelper.connect(user1).distributeToNewUser();
        await superHelper.connect(user2).distributeToNewUser();

        await helperToken.connect(user1).approve(await superHelper.getAddress(), rewardAmount);
        await superHelper.connect(user1).createJob("Test Disputed Job", rewardAmount);

        await superHelper.connect(user2).takeJob(0);

        await superHelper.connect(user1).completeAndReviewJob(0, 2, true);

        return {superHelper, helperToken, owner, user1, user2, rewardAmount};
    }

    describe("User registration: confirmKYCForUser", function () {
        it("Should confirm KYC for user", async function () {
            const {superHelper, owner, user1} = await loadFixture(deployContractsFixture);

            await superHelper.connect(owner).confirmKYCForUser(user1.address);

            const userData = await superHelper.users(user1.address);
            expect(userData.isKYCDone).to.be.true;
        });

        it("Should revert if user already confirmed KYC", async function () {
            const {superHelper, owner, user1} = await loadFixture(deployContractsFixture);

            await superHelper.connect(owner).confirmKYCForUser(user1.address);

            await expect(superHelper.connect(owner).confirmKYCForUser(user1.address))
                .to.be.revertedWith("This user is already KYC verified");
        });

        it("Should revert if called by non-owner", async function () {
            const {superHelper, user1} = await loadFixture(createAndDisputeJobFixture);

            await expect(superHelper.connect(user1).confirmKYCForUser(user1.address))
                .to.be.revertedWithCustomError(superHelper, "OwnableUnauthorizedAccount")
                .withArgs(user1.address);
        });
    });

    describe("User registration: distributeToNewUser", function () {

        it("Should register user correctly", async function () {
            const {superHelper, helperToken, owner, user1} = await loadFixture(deployContractsFixture);

            await superHelper.connect(owner).confirmKYCForUser(user1.address);
            await superHelper.connect(user1).distributeToNewUser();

            const userData = await superHelper.users(user1.address);
            expect(userData.isRegistered).to.be.true;

            const userBalance = await helperToken.balanceOf(user1.address);
            expect(userBalance).to.equal(100n * await helperToken.ONE_TOKEN());
        });

        it("Should emit event on user's first registration", async function () {
            const {superHelper, owner, user1} = await loadFixture(deployContractsFixture);

            await superHelper.connect(owner).confirmKYCForUser(user1.address);

            await expect(superHelper.connect(user1).distributeToNewUser())
                .to.emit(superHelper, "FirstRegistration")
                .withArgs(user1.address);
        });

        it("Should fail if user already registered", async function () {
            const {superHelper, owner, user1} = await loadFixture(deployContractsFixture);

            await superHelper.connect(owner).confirmKYCForUser(user1.address);

            await superHelper.connect(user1).distributeToNewUser();

            await expect(superHelper.connect(user1).distributeToNewUser())
                .to.be.revertedWith("This user is already registered");
        });

        it("Should fail if user has not done his KYC", async function () {
            const {superHelper, user1} = await loadFixture(deployContractsFixture);

            await expect(superHelper.connect(user1).distributeToNewUser())
                .to.be.revertedWith("Your KYC is not done");
        });

    });

    describe("Job Creation: createJob", function () {

        it("Should successfully create a job", async function () {
            const {superHelper, helperToken, owner, user1} = await loadFixture(deployContractsFixture);
            const reward = 100n * await helperToken.ONE_TOKEN();

            await superHelper.connect(owner).confirmKYCForUser(user1.address);
            await superHelper.connect(user1).distributeToNewUser();

            await helperToken.connect(user1).approve(await superHelper.getAddress(), reward);

            await superHelper.connect(user1).createJob("Help me build a fence", reward);

            const job = await superHelper.jobs(0);
            expect(job.description).to.equal("Help me build a fence");
            expect(job.reward).to.equal(reward);
            expect(job.creator).to.equal(user1.address);
            expect(job.status).to.equal(0); // CREATED
        });

        it("Should update last activity time after creating job", async function () {
            const {superHelper, helperToken, owner, user1} = await loadFixture(deployContractsFixture);
            const reward = 100n * await helperToken.ONE_TOKEN();

            await superHelper.connect(owner).confirmKYCForUser(user1.address);
            await superHelper.connect(user1).distributeToNewUser();

            const lastActivity = (await superHelper.users(user1.address)).lastActivity;

            await helperToken.connect(user1).approve(await superHelper.getAddress(), reward);

            await superHelper.connect(user1).createJob("Help me build a fence", reward);

            const lastActivityAfterCreatingJob = (await superHelper.users(user1.address)).lastActivity;

            expect(lastActivityAfterCreatingJob).to.be.greaterThan(lastActivity);

        });

        it("Should revert if user is not registered", async function () {
            const {superHelper, helperToken, other} = await loadFixture(deployContractsFixture);
            const reward = 50n * await helperToken.ONE_TOKEN();

            await expect(superHelper.connect(other).createJob("Unregistered Job", reward))
                .to.be.revertedWith("You're not registered");
        });

        it("Should revert job creation if insufficient allowance", async function () {
            const {superHelper, helperToken, owner, user1} = await loadFixture(deployContractsFixture);
            const reward = 50n * await helperToken.ONE_TOKEN();

            await superHelper.connect(owner).confirmKYCForUser(user1.address);
            await superHelper.connect(user1).distributeToNewUser();

            await expect(superHelper.connect(user1).createJob("No Allowance Job", reward))
                .to.be.revertedWithCustomError(superHelper, "InsufficientAllowance");
        });

        it("Should revert job creation if user's balance is insufficient", async function () {
            const {superHelper, helperToken, owner, user1} = await loadFixture(deployContractsFixture);
            const ONE_TOKEN = await helperToken.ONE_TOKEN();

            const initialReward = 100n * ONE_TOKEN;
            const insufficientReward = 101n * ONE_TOKEN;

            await superHelper.connect(owner).confirmKYCForUser(user1.address);
            await superHelper.connect(user1).distributeToNewUser();

            await helperToken.connect(user1).approve(await superHelper.getAddress(), initialReward);

            await expect(superHelper.connect(user1).createJob("Not enough funds job", insufficientReward))
                .to.be.revertedWithCustomError(superHelper, "InsufficientFunds")
                .withArgs(insufficientReward);
        });

        describe("Job Creation with Depreciation (Inactivity >= 90 days)", function () {

            it("Should successfully transfer depreciation amount AND create job", async function () {
                const {
                    superHelper,
                    helperToken,
                    user1,
                    ONE_TOKEN
                } = await loadFixture(deployAndPrepareDepreciationFixture);

                const jobReward = 10n * ONE_TOKEN; // 1000n
                const depreciationAmount = (100n * ONE_TOKEN * 5n) / 100n; // 500n

                await helperToken.connect(user1).approve(
                    await superHelper.getAddress(),
                    jobReward + depreciationAmount
                );

                const balanceInitialUser1 = await helperToken.balanceOf(user1.address);

                await expect(
                    superHelper.connect(user1).createJob("Job with depreciation activated", jobReward)
                ).to.not.be.reverted;

                const balanceFinalUser1 = await helperToken.balanceOf(user1.address);
                expect(balanceFinalUser1).to.equal(balanceInitialUser1 - jobReward - depreciationAmount);

                const job = await superHelper.jobs(0);
                expect(job.description).to.equal("Job with depreciation activated");
                expect(job.reward).to.equal(jobReward);
            });

            it("Should revert if user balance not sufficient for depreciation", async function () {
                const {
                    superHelper,
                    helperToken,
                    user1,
                    ONE_TOKEN
                } = await loadFixture(deployAndPrepareDepreciationFixture);

                const userBalance = await helperToken.balanceOf(user1.address);

                const largeReward = userBalance - 1n * ONE_TOKEN;

                await helperToken.connect(user1).approve(await superHelper.getAddress(), userBalance);

                await expect(
                    superHelper.connect(user1).createJob("Job should fail due to depreciation balance", largeReward)
                ).to.be.revertedWithCustomError(superHelper, "InsufficientFunds");
            });

            it("Should revert if allowance not sufficient for depreciation", async function () {
                const {
                    superHelper,
                    helperToken,
                    user1,
                    ONE_TOKEN
                } = await loadFixture(deployAndPrepareDepreciationFixture);

                const jobReward = 10n * ONE_TOKEN;
                const depreciationAmount = (100n * ONE_TOKEN * 5n) / 100n; // 500n

                await helperToken.connect(user1).approve(await superHelper.getAddress(), jobReward);

                await expect(
                    superHelper.connect(user1).createJob("Job should fail due to depreciation allowance", jobReward)
                ).to.be.revertedWithCustomError(superHelper, "InsufficientAllowance")
                    .withArgs(jobReward + depreciationAmount);
            });

        });


    });

    describe("Take Job: takeJob", function () {

        it("Should allow a registered user to take a job", async function () {
            const {superHelper, helperToken, owner, user1, user2} = await loadFixture(deployContractsFixture);
            const reward = 100n * await helperToken.ONE_TOKEN();

            await superHelper.connect(owner).confirmKYCForUser(user1.address);
            await superHelper.connect(owner).confirmKYCForUser(user2.address);
            await superHelper.connect(user1).distributeToNewUser();
            await superHelper.connect(user2).distributeToNewUser();

            await helperToken.connect(user1).approve(await superHelper.getAddress(), reward);
            await superHelper.connect(user1).createJob("Clean house", reward);

            await superHelper.connect(user2).takeJob(0);

            const job = await superHelper.jobs(0);
            expect(job.worker).to.equal(user2.address);
            expect(job.status).to.equal(1); // TAKEN
        });

        it("Should revert if user is not registered", async function () {
            const {superHelper, other} = await loadFixture(deployContractsFixture);

            await expect(superHelper.connect(other).takeJob(0))
                .to.be.revertedWith("You're not registered");
        });

        it("Should revert taking a job if already taken", async function () {
            const {superHelper, helperToken, owner, user1, user2, other} = await loadFixture(deployContractsFixture);
            const reward = 100n * await helperToken.ONE_TOKEN();

            await superHelper.connect(owner).confirmKYCForUser(user1.address);
            await superHelper.connect(owner).confirmKYCForUser(user2.address);
            await superHelper.connect(owner).confirmKYCForUser(other.address);
            await superHelper.connect(user1).distributeToNewUser();
            await superHelper.connect(user2).distributeToNewUser();
            await superHelper.connect(other).distributeToNewUser();

            await helperToken.connect(user1).approve(await superHelper.getAddress(), reward);
            await superHelper.connect(user1).createJob("Repair pipes", reward);

            await superHelper.connect(user2).takeJob(0);

            await expect(superHelper.connect(other).takeJob(0)).to.be.revertedWithCustomError(superHelper, "JobStatusIncorrect");
        });

        it("Should revert if the job creator take his job", async function () {
            const {superHelper, helperToken, owner, user1} = await loadFixture(deployContractsFixture);
            const reward = 100n * await helperToken.ONE_TOKEN();

            await superHelper.connect(owner).confirmKYCForUser(user1.address);
            await superHelper.connect(user1).distributeToNewUser();

            await helperToken.connect(user1).approve(await superHelper.getAddress(), reward);
            await superHelper.connect(user1).createJob("Clean house", reward);

            await expect(superHelper.connect(user1).takeJob(0)).to.be.revertedWith("Worker can't be the creator");
        });

        describe("Take job with Depreciation (Inactivity >= 90 days)", function () {

            async function prepareToTakeJob(superHelper: any, helperToken: any, creator: any, reward: bigint, depreciationAmount: bigint) {
                await helperToken.connect(creator).approve(
                    await superHelper.getAddress(),
                    reward + depreciationAmount
                );

                await superHelper.connect(creator).createJob("Job with depreciation activated", reward)
            }

            async function prepareBadgeLevel(nbJobToComplete: bigint) {
                const {
                    superHelper,
                    helperToken,
                    owner,
                    user1: creator,
                    user2: worker,
                } = await loadFixture(deployContractsFixture);

                const ONE_TOKEN = await helperToken.ONE_TOKEN();
                const jobReward = 1n * ONE_TOKEN;

                await superHelper.connect(owner).confirmKYCForUser(creator.address);
                await superHelper.connect(owner).confirmKYCForUser(worker.address);
                await superHelper.connect(creator).distributeToNewUser();
                await superHelper.connect(worker).distributeToNewUser();

                for (let i = 0; i < nbJobToComplete; i++) {
                    await helperToken.connect(creator).approve(await superHelper.getAddress(), jobReward);
                    await superHelper.connect(creator).createJob("Quick job", jobReward);
                    await superHelper.connect(worker).takeJob(i);
                    await superHelper.connect(creator).completeAndReviewJob(i, 3, false);
                }

                const ninetyDays = 90 * 24 * 60 * 60;
                const userDataBefore = await superHelper.users(creator.address);
                await time.increaseTo(userDataBefore.lastActivity + BigInt(ninetyDays));
                return {
                    superHelper,
                    helperToken,
                    creator,
                    worker,
                    ONE_TOKEN
                };
            }

            it("Should successfully transfer depreciation amount AND take job", async function () {
                const {
                    superHelper,
                    helperToken,
                    user1,
                    user2,
                    ONE_TOKEN
                } = await loadFixture(deployAndPrepareDepreciationFixture);

                const jobReward = 10n * ONE_TOKEN; // 1000n
                const depreciationAmount = (100n * ONE_TOKEN * 5n) / 100n; // 500n

                await prepareToTakeJob(superHelper, helperToken, user1, jobReward, depreciationAmount);

                const balanceUser2 = await helperToken.balanceOf(user2.address);

                await helperToken.connect(user2).approve(await superHelper.getAddress(), depreciationAmount);
                await superHelper.connect(user2).takeJob(0);

                const balanceFinalUser2 = await helperToken.balanceOf(user2.address);
                expect(balanceFinalUser2).to.equal(balanceUser2 - depreciationAmount);

                const job = await superHelper.jobs(0);
                expect(job.worker).to.equal(user2.address);
                expect(job.status).to.equal(1);
            });

            it("Should successfully compute depreciation amount with Bronze badge", async function () {
                const bronzeLevelJobToComplete = 10n;
                const {
                    superHelper,
                    helperToken,
                    creator,
                    worker,
                    ONE_TOKEN
                } = await prepareBadgeLevel(bronzeLevelJobToComplete)

                const workerState = await superHelper.users(worker.address);
                expect(workerState.nbJobCompleted).to.be.equal(bronzeLevelJobToComplete);
                expect(workerState.badgeLevel).to.be.equal(1); // BRONZE

                const jobReward = 1n * ONE_TOKEN; // 100n
                const workerBalanceExpected = (100n * ONE_TOKEN) + (1n * ONE_TOKEN * bronzeLevelJobToComplete) // 11000n
                expect(await helperToken.balanceOf(worker.address)).to.be.equal(workerBalanceExpected);
                const depreciationAmount = (workerBalanceExpected * 3n) / 100n; // 330n

                const creatorBalanceExpected = (100n * ONE_TOKEN) - (1n * ONE_TOKEN * bronzeLevelJobToComplete) // 9000n
                expect(await helperToken.balanceOf(creator.address)).to.be.equal(creatorBalanceExpected);
                const depreciationAmountForCreator = (creatorBalanceExpected * 5n) / 100n; // 450n

                await prepareToTakeJob(superHelper, helperToken, creator, jobReward, depreciationAmountForCreator);

                const balanceUser2 = await helperToken.balanceOf(worker.address);

                await helperToken.connect(worker).approve(await superHelper.getAddress(), depreciationAmount);
                await superHelper.connect(worker).takeJob(bronzeLevelJobToComplete + 1n);

                const balanceFinalUser2 = await helperToken.balanceOf(worker.address);
                expect(balanceFinalUser2).to.equal(balanceUser2 - depreciationAmount);
            });

            it("Should successfully compute depreciation amount with Silver badge", async function () {
                const silverLevelJobToComplete = 30n;
                const {
                    superHelper,
                    helperToken,
                    creator,
                    worker,
                    ONE_TOKEN
                } = await prepareBadgeLevel(silverLevelJobToComplete)

                const workerState = await superHelper.users(worker.address);
                expect(workerState.nbJobCompleted).to.be.equal(silverLevelJobToComplete);
                expect(workerState.badgeLevel).to.be.equal(2); // SILVER

                const jobReward = 1n * ONE_TOKEN; // 100n
                const workerBalanceExpected = (100n * ONE_TOKEN) + (1n * ONE_TOKEN * silverLevelJobToComplete) // 13000n
                expect(await helperToken.balanceOf(worker.address)).to.be.equal(workerBalanceExpected);
                const depreciationAmount = (workerBalanceExpected * 2n) / 100n; // 650n

                const creatorBalanceExpected = (100n * ONE_TOKEN) - (1n * ONE_TOKEN * silverLevelJobToComplete) // 9000n
                expect(await helperToken.balanceOf(creator.address)).to.be.equal(creatorBalanceExpected);
                const depreciationAmountForCreator = (creatorBalanceExpected * 5n) / 100n; // 450n

                await prepareToTakeJob(superHelper, helperToken, creator, jobReward, depreciationAmountForCreator);

                const balanceUser2 = await helperToken.balanceOf(worker.address);

                await helperToken.connect(worker).approve(await superHelper.getAddress(), depreciationAmount);
                await superHelper.connect(worker).takeJob(silverLevelJobToComplete + 1n);

                const balanceFinalUser2 = await helperToken.balanceOf(worker.address);
                expect(balanceFinalUser2).to.equal(balanceUser2 - depreciationAmount);
            });

            it("Should successfully compute depreciation amount with Gold badge", async function () {
                const goldLevelJobToComplete = 50n;
                const {
                    superHelper,
                    helperToken,
                    creator,
                    worker,
                    ONE_TOKEN
                } = await prepareBadgeLevel(goldLevelJobToComplete)

                const workerState = await superHelper.users(worker.address);
                expect(workerState.nbJobCompleted).to.be.equal(goldLevelJobToComplete);
                expect(workerState.badgeLevel).to.be.equal(3); // GOLD

                const jobReward = 1n * ONE_TOKEN; // 100n
                const workerBalanceExpected = (100n * ONE_TOKEN) + (1n * ONE_TOKEN * goldLevelJobToComplete) // 15000n
                expect(await helperToken.balanceOf(worker.address)).to.be.equal(workerBalanceExpected);
                const depreciationAmount = (workerBalanceExpected * 1n) / 100n; // 150n

                const creatorBalanceExpected = (100n * ONE_TOKEN) - (1n * ONE_TOKEN * goldLevelJobToComplete) // 9000n
                expect(await helperToken.balanceOf(creator.address)).to.be.equal(creatorBalanceExpected);
                const depreciationAmountForCreator = (creatorBalanceExpected * 5n) / 100n; // 450n

                await prepareToTakeJob(superHelper, helperToken, creator, jobReward, depreciationAmountForCreator);

                const balanceUser2 = await helperToken.balanceOf(worker.address);

                await helperToken.connect(worker).approve(await superHelper.getAddress(), depreciationAmount);
                await superHelper.connect(worker).takeJob(goldLevelJobToComplete + 1n);

                const balanceFinalUser2 = await helperToken.balanceOf(worker.address);
                expect(balanceFinalUser2).to.equal(balanceUser2 - depreciationAmount);
            });

            it("Should revert if allowance not sufficient for depreciation", async function () {
                const {
                    superHelper,
                    helperToken,
                    user1,
                    user2,
                    ONE_TOKEN
                } = await loadFixture(deployAndPrepareDepreciationFixture);

                const jobReward = 10n * ONE_TOKEN; // 1000n
                const depreciationAmount = (100n * ONE_TOKEN * 5n) / 100n; // 500n

                await prepareToTakeJob(superHelper, helperToken, user1, jobReward, depreciationAmount);

                await helperToken.connect(user2).approve(await superHelper.getAddress(), depreciationAmount - 1n);

                await expect(
                    superHelper.connect(user1).createJob("Job should fail due to depreciation allowance", jobReward)
                ).to.be.revertedWithCustomError(superHelper, "InsufficientAllowance");
            });

        });

    });

    describe("Complete and Review Job: completeAndReviewJob", function () {

        async function prepareAndTakeJob(superHelper: any, helperToken: any, owner: any, creator: any, worker: any, reward: bigint) {
            await superHelper.connect(owner).confirmKYCForUser(creator.address);
            await superHelper.connect(owner).confirmKYCForUser(worker.address);
            await superHelper.connect(creator).distributeToNewUser();
            await superHelper.connect(worker).distributeToNewUser();

            await helperToken.connect(creator).approve(await superHelper.getAddress(), reward);
            await superHelper.connect(creator).createJob("Job Test", reward);
            await superHelper.connect(worker).takeJob(0);
        }

        it("Should allow worker to complete job successfully and get paid", async function () {
            const {superHelper, helperToken, owner, user1: creator, user2: worker} = await loadFixture(deployContractsFixture);
            const reward = 100n * await helperToken.ONE_TOKEN();

            await prepareAndTakeJob(superHelper, helperToken, owner, creator, worker, reward);

            await expect(superHelper.connect(creator).completeAndReviewJob(0, 5, false))
                .to.emit(superHelper, "JobCompletedAndPaid")
                .withArgs(creator.address, worker.address, 0, reward, 5);

            const job = await superHelper.jobs(0);
            expect(job.status).to.equal(2); // COMPLETED
            expect(job.stars).to.equal(5);

            const workerBalance = await helperToken.balanceOf(worker.address);
            expect(workerBalance).to.be.equal(200n * await helperToken.ONE_TOKEN()); // 100 from registration + 100 reward paid

            const userWorker = await superHelper.users(worker.address);
            expect(userWorker.nbJobCompleted).to.equal(1);
        });

        it("Should allow the creator to send a bad rate and marked the job as disputed", async function () {
            const {superHelper, helperToken, owner, user1: creator, user2: worker} = await loadFixture(deployContractsFixture);
            const reward = 100n * await helperToken.ONE_TOKEN();

            await prepareAndTakeJob(superHelper, helperToken, owner, creator, worker, reward);

            await expect(superHelper.connect(creator).completeAndReviewJob(0, 1, true))
                .to.emit(superHelper, "JobDisputed")
                .withArgs(creator.address, worker.address, 0);

            const job = await superHelper.jobs(0);
            expect(job.status).to.equal(4); // Disputed
            expect(job.stars).to.equal(1);

            const workerBalance = await helperToken.balanceOf(worker.address);
            expect(workerBalance).to.be.equal(100n * await helperToken.ONE_TOKEN()); // 100 from registration

            const creatorBalance = await helperToken.balanceOf(creator.address);
            expect(creatorBalance).to.be.equal(0n); // 100 from registration - 100 locked in contract

            const userWorker = await superHelper.users(worker.address);
            expect(userWorker.nbJobCompleted).to.equal(0);
        });

        it("Should revert if called by a non register address", async function () {
            const {
                superHelper,
                helperToken,
                owner,
                user1: creator,
                user2: worker,
                other
            } = await loadFixture(deployContractsFixture);
            const reward = 80n * await helperToken.ONE_TOKEN();

            await prepareAndTakeJob(superHelper, helperToken, owner, creator, worker, reward);

            await expect(superHelper.connect(other).completeAndReviewJob(0, 4, false))
                .to.be.revertedWith("You're not registered");
        });

        it("Should revert if job is not in TAKEN status", async function () {
            const {superHelper, helperToken, owner, user1: creator} = await loadFixture(deployContractsFixture);
            const reward = 50n * await helperToken.ONE_TOKEN();

            await superHelper.connect(owner).confirmKYCForUser(creator.address);
            await superHelper.connect(creator).distributeToNewUser();
            await helperToken.connect(creator).approve(await superHelper.getAddress(), reward);

            await superHelper.connect(creator).createJob("Testing", reward);

            await expect(superHelper.connect(creator).completeAndReviewJob(0, 3, false))
                .to.be.revertedWithCustomError(superHelper, "JobStatusIncorrect")
                .withArgs(0, 1); // current.CREATED vs expected.TAKEN
        });

        it("Should revert if called by another address than the creator", async function () {
            const {superHelper, helperToken, owner, user1: creator, user2: worker} = await loadFixture(deployContractsFixture);
            const reward = 50n * await helperToken.ONE_TOKEN();

            await superHelper.connect(owner).confirmKYCForUser(creator.address);
            await superHelper.connect(owner).confirmKYCForUser(worker.address);
            await superHelper.connect(creator).distributeToNewUser();
            await superHelper.connect(worker).distributeToNewUser();
            await helperToken.connect(creator).approve(await superHelper.getAddress(), reward);

            await superHelper.connect(creator).createJob("Testing", reward);
            await superHelper.connect(worker).takeJob(0);

            await expect(superHelper.connect(worker).completeAndReviewJob(0, 3, false))
                .to.be.revertedWith("Only the creator can mark the job as complete and review it")
        });

        it("Should revert if called by another address than the creator", async function () {
            const {superHelper, helperToken, owner, user1: creator, user2: worker} = await loadFixture(deployContractsFixture);
            const reward = 50n * await helperToken.ONE_TOKEN();

            await superHelper.connect(owner).confirmKYCForUser(creator.address);
            await superHelper.connect(owner).confirmKYCForUser(worker.address);
            await superHelper.connect(creator).distributeToNewUser();
            await superHelper.connect(worker).distributeToNewUser();
            await helperToken.connect(creator).approve(await superHelper.getAddress(), reward);

            await superHelper.connect(creator).createJob("Testing", reward);
            await superHelper.connect(worker).takeJob(0);

            await expect(superHelper.connect(creator).completeAndReviewJob(0, 6, false))
                .to.be.revertedWith("The rate has to be between 0 and 5");
        });
    });

    describe("Cancel Job: cancelJob", function () {

        async function prepareJobWithoutTaking(superHelper: any, helperToken: any, owner: any, creator: any, reward: bigint) {
            await superHelper.connect(owner).confirmKYCForUser(creator.address);
            await superHelper.connect(creator).distributeToNewUser();
            await helperToken.connect(creator).approve(await superHelper.getAddress(), reward);
            await superHelper.connect(creator).createJob("Cancel Job Test", reward);
        }

        async function prepareAndTakeJob(superHelper: any, helperToken: any, owner: any, creator: any, worker: any, reward: bigint) {
            await superHelper.connect(owner).confirmKYCForUser(creator.address);
            await superHelper.connect(owner).confirmKYCForUser(worker.address);
            await superHelper.connect(creator).distributeToNewUser();
            await superHelper.connect(worker).distributeToNewUser();

            await helperToken.connect(creator).approve(await superHelper.getAddress(), reward);
            await superHelper.connect(creator).createJob("Job Test", reward);
            await superHelper.connect(worker).takeJob(0);
        }

        it("Should allow job creator to cancel job if not yet taken", async function () {
            const {superHelper, helperToken, owner, user1: creator} = await loadFixture(deployContractsFixture);
            const reward = 100n * await helperToken.ONE_TOKEN();

            await prepareJobWithoutTaking(superHelper, helperToken, owner, creator, reward);

            await expect(superHelper.connect(creator).cancelJob(0))
                .to.emit(superHelper, "JobCanceled")
                .withArgs(creator.address, 0);

            const job = await superHelper.jobs(0);
            expect(job.status).to.equal(3); // CANCELLED

            // tokens refunded
            expect(await helperToken.balanceOf(creator.address)).to.be.equal(100n * await helperToken.ONE_TOKEN());
        });

        it("Should revert cancellation if job already taken", async function () {
            const {
                superHelper,
                helperToken,
                owner,
                user1: creator,
                user2: worker
            } = await loadFixture(deployContractsFixture);
            const reward = 100n * await helperToken.ONE_TOKEN();

            await prepareAndTakeJob(superHelper, helperToken, owner, creator, worker, reward);

            await expect(superHelper.connect(creator).cancelJob(0))
                .to.be.revertedWithCustomError(superHelper, "JobStatusIncorrect")
                .withArgs(1, 0); // current.TAKEN vs expected.CREATED
        });

        it("Should revert cancellation if user is not creator of the job", async function () {
            const {superHelper, helperToken, owner, user1: creator, other} = await loadFixture(deployContractsFixture);
            const reward = 70n * await helperToken.ONE_TOKEN();

            await prepareJobWithoutTaking(superHelper, helperToken, owner, creator, reward);

            await superHelper.connect(owner).confirmKYCForUser(other.address);
            await superHelper.connect(other).distributeToNewUser();

            await expect(superHelper.connect(other).cancelJob(0))
                .to.be.revertedWith("Only the creator can cancel the job");
        });

    });

    describe("Job Dispute Handling: handleDisputedJob", function () {

        it("Should resolve dispute positively, rewarding worker", async function () {
            const {
                superHelper,
                helperToken,
                owner,
                user1: creator,
                user2: worker,
                rewardAmount
            } = await loadFixture(createAndDisputeJobFixture);

            const workerBalanceBefore = await helperToken.balanceOf(worker.address);

            await expect(superHelper.connect(owner).handleDisputedJob(0, true))
                .to.emit(superHelper, "JobCompletedAndPaid")
                .withArgs(
                    creator.address,
                    worker.address,
                    0,
                    rewardAmount,
                    2
                );

            const jobAfter = await superHelper.jobs(0);
            expect(jobAfter.status).to.equal(2); // COMPLETED

            const workerBalanceAfter = await helperToken.balanceOf(worker.address);
            expect(workerBalanceAfter).to.equal(workerBalanceBefore + rewardAmount);

            const userWorker = await superHelper.users(worker.address);
            expect(userWorker.nbJobCompleted).to.equal(1);
        });

        it("Should resolve dispute negatively, refunding creator", async function () {
            const {
                superHelper,
                helperToken,
                owner,
                user1: creator,
                user2: worker,
                rewardAmount
            } = await loadFixture(createAndDisputeJobFixture);

            const creatorBalanceBefore = await helperToken.balanceOf(creator.address);

            await expect(superHelper.connect(owner).handleDisputedJob(0, false))
                .to.emit(superHelper, "JobCompletedButNotPaid")
                .withArgs(
                    creator.address,
                    worker.address,
                    0,
                    rewardAmount,
                    2
                );

            const jobAfter = await superHelper.jobs(0);
            expect(jobAfter.status).to.equal(2); // COMPLETED

            const creatorBalanceAfter = await helperToken.balanceOf(creator.address);
            expect(creatorBalanceAfter).to.equal(creatorBalanceBefore + rewardAmount);

            const userWorker = await superHelper.users(worker.address);
            expect(userWorker.nbJobCompleted).to.equal(0);
        });

        it("Should revert if called by non-owner", async function () {
            const {superHelper, user1} = await loadFixture(createAndDisputeJobFixture);

            await expect(superHelper.connect(user1).handleDisputedJob(0, true))
                .to.be.revertedWithCustomError(superHelper, "OwnableUnauthorizedAccount")
                .withArgs(user1.address);
        });

        it("Should fail if job is not disputed", async function () {
            const {superHelper, helperToken, owner, user1} = await loadFixture(deployContractsFixture);
            const ONE_TOKEN = await helperToken.ONE_TOKEN();
            const rewardAmount = 50n * ONE_TOKEN;

            await superHelper.connect(owner).confirmKYCForUser(user1.address);
            await superHelper.connect(user1).distributeToNewUser();
            await helperToken.connect(user1).approve(await superHelper.getAddress(), rewardAmount);
            await superHelper.connect(user1).createJob("Test Job Not Disputed", rewardAmount);

            await expect(superHelper.connect(owner).handleDisputedJob(0, true))
                .to.be.revertedWithCustomError(superHelper, "JobStatusIncorrect")
                .withArgs(0, 4); // current.CREATED vs expected.Disputed
        });
    });
});

