//Raffle
//Enter the lottery (paying some amount)
//Pick a random winner (verifiably random)
//Winner to be selected evry X .inuter ->completely automated
//Chainlink Oracle -> Randomness, Automated execution (Chainlink Keepers)

//SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;

import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/AutomationCompatible.sol"; //chainlink keepers interface

error Raffle__NotEnoughETHEntered();
error Raffle_TransferFailed();
error Raffle_NotOpen();
error Raffle_UpKeepNotNeeded(uint256 currentBalance, uint256 numPlayers, uint256 raffleState);

contract Raffle is VRFConsumerBaseV2, AutomationCompatible {
    /**Types */
    enum RaffleState {
        OPEN,
        CALCULATING
        //uint256 0 = OPEN, 1 = CALCULATING
    }

    /*State Variables*/
    uint256 private immutable i_entranceFee;
    address payable[] private s_players; //payable beacause if one of them wins ,we have tompay them
    VRFCoordinatorV2Interface private immutable i_vrfCoordinator;
    bytes32 private immutable i_gasLane;
    uint64 private immutable i_subscriptionId;
    uint32 private immutable i_callbackGasLimit;
    uint16 private constant REQUEST_CONFORMATIONS = 3;
    uint32 private constant NUM_WORDS = 1;

    //Lottery Variables
    address private s_recentWinner;
    RaffleState private s_raffleState;
    uint256 private s_lastTimeStamp;
    uint256 private immutable i_interval;

    /*Events */
    event RaffleEnter(address indexed players);
    event RequestedRaffleWinner(uint256 indexed RequestId);
    event winnerPicked(address indexed winner);

    //vrfCoordinatorV2 is constructor from vrfCoordinatorV2.sol
    //vrfCoordinatorV2 is the address of contract that does the random number verification
    constructor(
        address vrfCoordinatorV2, //contract address
        uint256 entranceFee,
        bytes32 gasLane,
        uint64 subscriptionId,
        uint32 callbackGasLimit,
        uint256 interval
    ) VRFConsumerBaseV2(vrfCoordinatorV2) {
        i_entranceFee = entranceFee;
        i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2); //warpping vrfCoordinatorV2 address around VRFCoordinatorV2Interface interface so that we can work with vrfCoordinator contract
        i_gasLane = gasLane;
        i_subscriptionId = subscriptionId;
        i_callbackGasLimit = callbackGasLimit;
        s_raffleState = RaffleState.OPEN;
        s_lastTimeStamp = block.timestamp;
        i_interval = interval;
    }

    function enterRaffle() public payable {
        //require msg.value > i_entranceFee
        if (msg.value < i_entranceFee) {
            revert Raffle__NotEnoughETHEntered();
        }
        //to check if raffle is open or not
        if (s_raffleState != RaffleState.OPEN) {
            revert Raffle_NotOpen();
        }
        s_players.push(payable(msg.sender));
        //Emit an event when we update a dynamic array or ampping
        //Name events with the function name reversed , reverse of enterRaffle
        //This events are emitted to data storage outside of samrt contract
        emit RaffleEnter(msg.sender); //player will run this function through UI, so player will be sender. That's why msg.sender is player
    }

    /**
     * @dev This is the function that the Chainlink Keeper nodes call
     * they look for 'upKeepNeeded' to return true
     * The folowing should be true in order to return true
     * 1.Our time interval sould have passed.
     * 2.Lotteyr should have at least 1 player, and have some ETH.
     * 3. Our subscription is funded with LINK.
     * 4. Lottery should be in "open" state.
     * And if these all conditions are trur keepers will update the data
     */
    function checkUpkeep(
        bytes memory /*checkData*/
    )
        public
        override
        returns (
            bool upKeepNeeded,
            bytes memory /* performData */
        )
    {
        //to check whether raffle is open or not
        bool isOpen = (RaffleState.OPEN == s_raffleState);

        //to check if interval time passed or not
        bool timePassed = ((block.timestamp - s_lastTimeStamp) > i_interval);

        //to check if we have enough players
        bool hasPlayers = (s_players.length > 0);

        //to check if we have enough balance
        bool hasBalance = address(this).balance > 0;

        upKeepNeeded = (isOpen && timePassed && hasPlayers && hasBalance);
        return (upKeepNeeded, "0x0");
    }

    //This function will be called by "chainlink keepers network" so that it can run automaticlally without us interact with it
    //external functions are little bit cheaper than public functions coz only our own contract can call this
    function performUpkeep(
        bytes calldata /*checkData*/
    ) external override {
        //To pick a random numner::
        //Request a random number: function performUpkeep()
        //Once we get it, do something with it: function fulfillRandomWords()
        //2 transaction process
        // By this function we will request a random number
        //this function will return uint256 requestId

        (bool upKeepNeeded, ) = checkUpkeep("");
        if (!upKeepNeeded) {
            revert Raffle_UpKeepNotNeeded(
                address(this).balance,
                s_players.length,
                uint256(s_raffleState)
            );
        }
        s_raffleState = RaffleState.CALCULATING; //so nobody can enter lottery after requesting for random number
        uint256 requestId = i_vrfCoordinator.requestRandomWords(
            i_gasLane, //gasane: maximum price of gas paid in wei
            i_subscriptionId, //for subscription that we need for funding our request or id of subscription we are using to request our random Number
            REQUEST_CONFORMATIONS, //howmany conformations the chainlink node shoould wait before responding
            i_callbackGasLimit, //imit for howmuch gas to use for callback request to your contract's fulfilRandomWords() function
            NUM_WORDS //howmany random numbers we waana get
        );
        emit RequestedRaffleWinner(requestId);
    }

    //fulfilling random numbers
    //we will override this function from contract VRFConsumeBase2.sol coz this function is declared by "virtual" in VRFConsumeBase2.sol
    function fulfillRandomWords(
        uint256, /*requestId*/
        uint256[] memory randomWords
    ) internal override {
        //from this function we will get the random number
        //randomWords array will have one element
        uint256 indexOfWinner = randomWords[0] % s_players.length; //by this operation we can get index of winner
        address payable recentWinner = s_players[indexOfWinner];
        s_recentWinner = recentWinner;
        s_raffleState = RaffleState.OPEN; //lottery is open again after winner is selected or reset the raffle state
        s_players = new address payable[](0); //resetting the player array
        s_lastTimeStamp = block.timestamp;
        (bool success, ) = recentWinner.call{value: address(this).balance}(""); //To send money to recent winner
        if (!success) {
            revert Raffle_TransferFailed();
        }
        emit winnerPicked(recentWinner);
    }

    /*View / pure functions */
    function getEntranceFee() public view returns (uint256) {
        return i_entranceFee;
    }

    function getPlayers(uint256 index) public view returns (address) {
        return s_players[index];
    }

    function getRecentWinner() public view returns (address) {
        return s_recentWinner;
    }

    function getRaffleState() public view returns (RaffleState) {
        return s_raffleState;
    }

    function getNumWords() public pure returns (uint256) {
        return NUM_WORDS; //function is reading a constant variable and is not reading from storage that's why function is declare as pure
    }

    function getNumberOfPlayers() public view returns (uint256) {
        return s_players.length;
    }

    function getLatestTimeStamp() public view returns (uint256) {
        return s_lastTimeStamp;
    }

    function getRequestConformation() public pure returns (uint256) {
        return REQUEST_CONFORMATIONS;
    }

    function getInterval() public view returns (uint256) {
        return i_interval;
    }
}
