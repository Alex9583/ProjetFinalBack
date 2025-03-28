// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";

import {HelperToken} from "./HelperToken.sol";

/*
 * @title Contract for managing jobs and user rewards with HelperToken
 * @notice Allows registered users to create, accept, complete, and rate paid jobs
 */
contract SuperHelper is Ownable {
    HelperToken public helperToken;

    enum JobStatus {
        CREATED,
        TAKEN,
        COMPLETED,
        CANCELLED
    }

    enum Badge {
        NONE,
        BRONZE,
        SILVER,
        GOLD
    }

    struct Job {
        address creator;
        address worker;
        string description;
        uint8 stars;
        uint256 reward;
        JobStatus status;
    }

    struct User {
        uint256 lastActivity;
        uint256 nbJobCompleted;
        Badge badgeLevel;
        bool isRegistered;
    }

    mapping(address => User) public users;
    mapping(uint256 => Job) public jobs;
    uint256 public jobCount;

    event FirstRegistration(address newUser);
    event JobAdded(address indexed creator, string description, uint price, uint id, bool isFinished);
    event JobTaken(address indexed worker, uint id);
    event JobIsCompletedAndPaid(address indexed creator, address indexed worker, uint id, uint pricePaid, uint stars);
    event JobIsCompletedButNotPaid(address indexed creator, address indexed worker, uint id, uint pricePaid, uint stars);
    event JobCanceled(address indexed creator, uint id);

    error FundsFailedToBeTransfer();
    error InsufficientAllowance(uint256 required);
    error InsufficientFunds(uint256 required);
    error JobStatusIncorrect(JobStatus current, JobStatus expected);

    constructor() Ownable(msg.sender) {
        helperToken = new HelperToken();
    }

    /**
     * @dev Modifier to ensure only registered users perform certain actions.
     */
    modifier onlyRegisteredUser() {
        require(users[msg.sender].isRegistered, "You're not registered");
        _;
    }

    /**
    * @notice Registers a new user and transfers initial tokens from the contract.
    * Checks if the user is not already registered and if the contract has sufficient funds.
    * Emits an event upon successful first registration.
    */
    function distributeToNewUser() external {
        require(helperToken.balanceOf(address(this)) >= 100 * helperToken.ONE_TOKEN(), "Not enough funds in the contract");
        require(!users[msg.sender].isRegistered, "This user is already registered");

        users[msg.sender] = User(block.timestamp, 0, Badge.NONE, true);
        helperToken.transfer(msg.sender, 100 * helperToken.ONE_TOKEN());

        emit FirstRegistration(msg.sender);
    }

    /**
    * @notice Creates a new job posting after checking balance, allowance and transferring the reward to contract.
    * Initializes job status to CREATED and increments total job count.
    * Updates creator's activity timestamp.
    * @param _description Job details provided by creator.
    * @param _reward Amount offered as reward for job completion.
    */
    function createJob(string memory _description, uint256 _reward) external onlyRegisteredUser {
        require(helperToken.balanceOf(msg.sender) >= _reward, InsufficientFunds(_reward));
        require(helperToken.allowance(msg.sender, address(this)) >= _reward, InsufficientAllowance(_reward));
        require(helperToken.transferFrom(msg.sender, address(this), _reward), FundsFailedToBeTransfer());
        _applyDepreciationIfNeeded(0);

        jobs[jobCount] = Job({
            creator: msg.sender,
            worker: address(0),
            description: _description,
            stars: 0,
            reward: _reward,
            status: JobStatus.CREATED
        });

        jobCount++;
        _updateActivity();
    }

    /**
    * @notice Assigns sender as worker for a job if available, marks job as TAKEN, and updates activity.
    * Job must be in CREATED status and creator cannot be the worker.
    * @param _jobId ID of the job to take.
    */
    function takeJob(uint256 _jobId) external onlyRegisteredUser {
        Job memory job = jobs[_jobId];
        require(job.status == JobStatus.CREATED, JobStatusIncorrect(job.status, JobStatus.CREATED));
        require(job.creator != msg.sender, "Worker can't be the creator");
        _applyDepreciationIfNeeded(0);

        job.worker = msg.sender;
        job.status = JobStatus.TAKEN;
        jobs[_jobId] = job;
        _updateActivity();

        emit JobTaken(msg.sender, _jobId);
    }

    /**
    * @notice Marks a job as completed, sets rating from creator, and manages reward payment.
    * Transfers reward to worker if job rating is above 2, otherwise refunds the creator.
    * Updates activity and potentially badge status of the worker.
    * @param _jobId ID of the job to complete and review.
    * @param _rating Rating (0-5) provided by the job creator to the worker.
    */
    function completeAndReviewJob(uint256 _jobId, uint8 _rating) external onlyRegisteredUser {
        Job memory job = jobs[_jobId];
        require(msg.sender == job.creator, "Only the creator can mark the job as complete and review it");
        require(job.status == JobStatus.TAKEN, JobStatusIncorrect(job.status, JobStatus.TAKEN));
        require(_rating >= 0 && _rating <= 5, "The rate has to be between 0 and 5");
        _applyDepreciationIfNeeded(0);

        job.stars = _rating;
        job.status = JobStatus.COMPLETED;
        _updateActivity();

        if (_rating > 2) {
            require(helperToken.transfer(job.worker, job.reward), FundsFailedToBeTransfer());
            jobs[_jobId] = job;
            _updateBadgeActivity(job.worker);
            emit JobIsCompletedAndPaid(job.creator, job.worker, _jobId, job.reward, _rating);
        } else {
            require(helperToken.transfer(job.creator, job.reward), FundsFailedToBeTransfer());
            jobs[_jobId] = job;
            emit JobIsCompletedButNotPaid(job.creator, job.worker, _jobId, job.reward, _rating);
        }
    }

    /**
    * @notice Cancels job if called by creator and if status is CREATED.
    * Refunds job reward, applies depreciation if needed, updates user activity.
    * @param _jobId ID of the job to cancel.
    */
    function cancelJob(uint256 _jobId) external onlyRegisteredUser {
        Job memory job = jobs[_jobId];

        require(msg.sender == job.creator, "Only the creator can cancel the job");
        require(job.status == JobStatus.CREATED, JobStatusIncorrect(job.status, JobStatus.CREATED));
        _applyDepreciationIfNeeded(0);

        job.status = JobStatus.CANCELLED;
        helperToken.transfer(job.creator, job.reward);
        jobs[_jobId] = job;
        _updateActivity();
    }


    /**
    * @dev Updates msg sender's last activity timestamp to current block time.
    */
    function _updateActivity() internal {
        users[msg.sender].lastActivity = block.timestamp;
    }


    /**
    * @dev Updates user's badge based on completed jobs count.
    * Badge upgrades occur at 10 (BRONZE), 30 (SILVER), and 50 (GOLD) jobs.
    * @param _user Address of user whose badge to update.
    */
    function _updateBadgeActivity(address _user) internal {
        User memory user = users[_user];
        user.nbJobCompleted++;

        if (user.nbJobCompleted == 10) {
            user.badgeLevel = Badge.BRONZE;
        } else if (user.nbJobCompleted == 30) {
            user.badgeLevel = Badge.SILVER;
        } else if (user.nbJobCompleted == 50) {
            user.badgeLevel = Badge.GOLD;
        }

        users[_user] = user;
    }

    /**
    * @dev Applies token depreciation if user inactive ≥ 30 days.
    * Depreciation rate based on user's badge (1-5%).
    * @param _otherExpense Additional token expense required alongside depreciation.
    */
    function _applyDepreciationIfNeeded(uint256 _otherExpense) internal {
        uint256 inactiveTime = block.timestamp - users[msg.sender].lastActivity;
        if (inactiveTime >= 30 days) {
            Badge badge = users[msg.sender].badgeLevel;
            uint256 rate = badge == Badge.NONE ? 5 : badge == Badge.BRONZE ? 3 : badge == Badge.SILVER ? 2 : 1;
            uint256 depreciationAmount = (helperToken.balanceOf(msg.sender) * rate) / 100;
            uint256 totalRequired = depreciationAmount + _otherExpense;

            require(helperToken.balanceOf(msg.sender) >= totalRequired, InsufficientFunds(totalRequired));
            require(
                helperToken.allowance(msg.sender, address(this)) >= depreciationAmount,
                InsufficientAllowance(totalRequired)
            );
            helperToken.transferFrom(msg.sender, address(this), depreciationAmount);
            _updateActivity();
        }
    }
}
