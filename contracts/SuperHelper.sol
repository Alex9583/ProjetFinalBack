// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";

import {HelperToken} from "./HelperToken.sol";

contract SuperHelper is Ownable {
    HelperToken private helperToken;

    enum JobStatus {
        CREATED,
        TAKEN,
        IN_REVIEW,
        COMPLETED,
        CANCELLED
    }

    struct Job {
        address creator;
        address worker;
        string description;
        uint8 stars;
        uint256 reward;
        JobStatus status;
    }

    mapping(uint256 => Job) public jobs;
    uint256 public jobCount;

    event FirstRegistration(address newUser);
    event JobAdded(address indexed author, string description, uint price, uint id, bool isFinished);
    event JobTaken(address indexed worker, uint id);
    event JobReviewed(uint id, uint8 stars);
    event JobIsFinishedAndPaid(address indexed author, address indexed worker, uint id, uint pricePaid);
    event JobCanceled(address indexed author, uint id);

    constructor() Ownable(msg.sender) {
        helperToken = new HelperToken();
    }

    function distributeToNewUser(address _newUser) external onlyOwner {
        require(helperToken.balanceOf(address(this)) >= 100 * helperToken.ONE_TOKEN(), "Not enough funds in the contract");
        require(helperToken.balanceOf(_newUser) == 0, "This user already have tokens");
        helperToken.transfer(_newUser, 100 * helperToken.ONE_TOKEN());
        emit FirstRegistration(_newUser);
    }

    function createJob(string memory _description, uint256 _reward) external {
        require(helperToken.balanceOf(msg.sender) >= _reward, "Insufficient funds");
        require(helperToken.allowance(msg.sender, address(this)) >= _reward, "Allowance necessary");

        require(helperToken.transferFrom(msg.sender, address(this), _reward), "Funds failed to be transfer");

        jobs[jobCount] = Job({
            creator: msg.sender,
            worker: address(0),
            description: _description,
            stars: 0,
            reward: _reward,
            status: JobStatus.CREATED
        });

        jobCount++;
    }

    function takeJob(uint256 _jobId) external {
        Job memory job = jobs[_jobId];
        require(job.status == JobStatus.CREATED, "Job unavailable");

        job.worker = msg.sender;
        job.status = JobStatus.TAKEN;
        jobs[_jobId] = job;
        emit JobTaken(msg.sender, _jobId);
    }
}
