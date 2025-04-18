// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";

import {HelperToken} from "./HelperToken.sol";

/*
 * @title Contract for managing jobs and user rewards with HelperToken
 * @notice Allows registered users to create, accept, complete, and rate paid jobs
 * @dev The contract uses OpenZeppelin's Ownable for access control functionality.
 */
contract SuperHelper is Ownable {
    HelperToken public helperToken;

    enum JobStatus {
        CREATED,
        TAKEN,
        COMPLETED,
        CANCELLED,
        DISPUTED
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
        bool isKYCDone;
    }

    mapping(address => User) public users;
    mapping(uint256 => Job) public jobs;
    uint256 public jobCount;

    event FirstRegistration(address indexed newUser);
    event JobAdded(address indexed creator, string description, uint256 price, uint256 id);
    event JobTaken(address indexed worker, uint256 id);
    event JobCompletedAndPaid(address indexed creator, address indexed worker, uint256 id, uint256 pricePaid, uint8 stars);
    event JobCompletedButNotPaid(address indexed creator, address indexed worker, uint256 id, uint256 pricePaid, uint8 stars);
    event JobCanceled(address indexed creator, uint256 id);
    event JobDisputed(address indexed creator, address indexed worker, uint256 id);

    error InsufficientAllowance(uint256 required);
    error InsufficientFunds(uint256 required);
    error JobStatusIncorrect(JobStatus current, JobStatus expected);

    constructor() Ownable(msg.sender) {
        helperToken = new HelperToken();
    }

    /**
     * @dev Modifier to ensure only KYC users can get first registration's token.
     */
    modifier onlyKYCUser() {
        require(users[msg.sender].isKYCDone, "Your KYC is not done");
        _;
    }

    /**
     * @dev Modifier to ensure only registered users perform certain actions.
     */
    modifier onlyRegisteredUser() {
        require(users[msg.sender].isRegistered, "You're not registered");
        _;
    }

    /**
     * @notice Confirms the KYC status for a given user.
     * @dev Can only be called by the contract owner.
     * Marks the specified user's KYC as completed, preventing registration abuse for tokens.
     * @param _newUserAddress The address of the user whose KYC status is being confirmed.
     */
    function confirmKYCForUser(address _newUserAddress) external onlyOwner {
        require(!users[_newUserAddress].isKYCDone, "This user is already KYC verified");
        users[_newUserAddress].isKYCDone = true;
    }

    /**
    * @notice Registers a new user and transfers initial tokens from the contract.
    * Checks if the user has done the KYC, he is not already registered and if the contract has sufficient funds.
    * Emits an event upon successful first registration.
    */
    function distributeToNewUser() external onlyKYCUser {
        require(helperToken.balanceOf(address(this)) >= 100 * helperToken.ONE_TOKEN(), "Not enough funds in the contract");
        require(!users[msg.sender].isRegistered, "This user is already registered");

        users[msg.sender].lastActivity = block.timestamp;
        users[msg.sender].isRegistered = true;
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
        _applyDepreciationIfNeeded(_reward);
        require(helperToken.balanceOf(msg.sender) >= _reward, InsufficientFunds(_reward));
        require(helperToken.allowance(msg.sender, address(this)) >= _reward, InsufficientAllowance(_reward));
        helperToken.transferFrom(msg.sender, address(this), _reward);

        uint256 jobId = jobCount;

        jobs[jobId] = Job({
            creator: msg.sender,
            worker: address(0),
            description: _description,
            stars: 0,
            reward: _reward,
            status: JobStatus.CREATED
        });

        jobCount++;
        _updateActivity();
        emit JobAdded(msg.sender, _description, _reward, jobId);
    }

    /**
    * @notice Assigns sender as worker for a job if available, marks job as TAKEN, and updates activity.
    * Job must be in CREATED status and creator cannot be the worker.
    * @param _jobId ID of the job to take.
    */
    function takeJob(uint256 _jobId) external onlyRegisteredUser {
        Job storage job = jobs[_jobId];
        require(job.status == JobStatus.CREATED, JobStatusIncorrect(job.status, JobStatus.CREATED));
        require(job.creator != msg.sender, "Worker can't be the creator");
        _applyDepreciationIfNeeded(0);

        job.worker = msg.sender;
        job.status = JobStatus.TAKEN;
        _updateActivity();

        emit JobTaken(msg.sender, _jobId);
    }

    /**
    * @notice Marks a job as completed, sets the rating from creator, and manages reward payment.
    * If the job is disputed, changes status to DISPUTED and do not pay the worker.
    * @param _jobId ID of the job to complete and review.
    * @param _rating Rating (from 0 to 5 inclusive) provided by the job creator to the worker.
    * @param _isDisputed Boolean flag indicating if the job is disputed. If true, sets job status to DISPUTED.
    */
    function completeAndReviewJob(uint256 _jobId, uint8 _rating, bool _isDisputed) external onlyRegisteredUser {
        Job storage job = jobs[_jobId];
        require(msg.sender == job.creator, "Only the creator can mark the job as complete and review it");
        require(job.status == JobStatus.TAKEN, JobStatusIncorrect(job.status, JobStatus.TAKEN));
        require(_rating >= 0 && _rating <= 5, "The rate has to be between 0 and 5");
        _applyDepreciationIfNeeded(0);

        job.stars = _rating;
        _updateActivity();

        if (_isDisputed) {
            job.status = JobStatus.DISPUTED;
            emit JobDisputed(job.creator, job.worker, _jobId);
        } else {
            job.status = JobStatus.COMPLETED;
            _updateBadgeActivity(job.worker);
            helperToken.transfer(job.worker, job.reward);
            emit JobCompletedAndPaid(job.creator, job.worker, _jobId, job.reward, _rating);
        }
    }

    /**
    * @notice Cancels job if called by creator and if status is CREATED.
    * Refunds job reward, applies depreciation if needed, updates user activity.
    * @param _jobId ID of the job to cancel.
    */
    function cancelJob(uint256 _jobId) external onlyRegisteredUser {
        Job storage job = jobs[_jobId];

        require(msg.sender == job.creator, "Only the creator can cancel the job");
        require(job.status == JobStatus.CREATED, JobStatusIncorrect(job.status, JobStatus.CREATED));
        _applyDepreciationIfNeeded(0);

        job.status = JobStatus.CANCELLED;
        helperToken.transfer(job.creator, job.reward);
        _updateActivity();
        emit JobCanceled(msg.sender, _jobId);
    }

    /**
    * @notice Handles a disputed job by resolving its status and managing the reward transfer accordingly.
    * Only callable by the contract owner
    * @param _jobId ID of the disputed job to handle.
    * @param _isResolved Boolean flag indicating the resolution outcome. If true, rewards the worker; if false, refunds the creator.
    */
    function handleDisputedJob(uint256 _jobId, bool _isResolved) external onlyOwner {
        Job storage job = jobs[_jobId];

        require(job.status == JobStatus.DISPUTED, JobStatusIncorrect(job.status, JobStatus.DISPUTED));

        if (_isResolved) {
            job.status = JobStatus.COMPLETED;
            _updateBadgeActivity(job.worker);
            helperToken.transfer(job.worker, job.reward);
            emit JobCompletedAndPaid(job.creator, job.worker, _jobId, job.reward, job.stars);
        } else {
            job.status = JobStatus.COMPLETED;
            helperToken.transfer(job.creator, job.reward);
            emit JobCompletedButNotPaid(job.creator, job.worker, _jobId, job.reward, job.stars);
        }
    }


    /**
    * @dev Updates msg sender's last activity timestamp to current block time.
    */
    function _updateActivity() private {
        users[msg.sender].lastActivity = block.timestamp;
    }


    /**
    * @dev Updates user's badge based on completed jobs count.
    * Badge upgrades occur at 10 (BRONZE), 30 (SILVER), and 50 (GOLD) jobs.
    * @param _user Address of user whose badge to update.
    */
    function _updateBadgeActivity(address _user) private {
        User storage user = users[_user];
        user.nbJobCompleted++;

        if (user.nbJobCompleted == 10) {
            user.badgeLevel = Badge.BRONZE;
        } else if (user.nbJobCompleted == 30) {
            user.badgeLevel = Badge.SILVER;
        } else if (user.nbJobCompleted == 50) {
            user.badgeLevel = Badge.GOLD;
        }
    }

    /**
    * @dev Applies token depreciation if user inactive ≥ 30 days.
    * Depreciation rate based on user's badge (1-5%).
    * @param _otherExpense Additional token expense required alongside depreciation.
    */
    function _applyDepreciationIfNeeded(uint256 _otherExpense) private {
        uint256 inactiveTime = block.timestamp - users[msg.sender].lastActivity;
        if (inactiveTime >= 90 days) {
            Badge badge = users[msg.sender].badgeLevel;
            uint256 rate = badge == Badge.NONE ? 5 : badge == Badge.BRONZE ? 3 : badge == Badge.SILVER ? 2 : 1;
            uint256 depreciationAmount = (helperToken.balanceOf(msg.sender) * rate) / 100;
            uint256 totalRequired = depreciationAmount + _otherExpense;

            require(helperToken.balanceOf(msg.sender) >= totalRequired, InsufficientFunds(totalRequired));
            require(
                helperToken.allowance(msg.sender, address(this)) >= totalRequired,
                InsufficientAllowance(totalRequired)
            );
            helperToken.transferFrom(msg.sender, address(this), depreciationAmount);
            _updateActivity();
        }
    }
}
