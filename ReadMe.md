# Event Scanner Web Application - Setup Guide 

### 1\. System Requirements  

a. Node.js \& npm installed (v18 or later recommended)  

b. Truffle framework installed globally (npm install -g truffle)  

c. Ganache (GUI or CLI) running on port 7546  

d. MetaMask browser extension installed  

### 2\. Setup Instructions  

a. Unzip the BlockChain-main project folder and open the contracts in Remix.  

b. Then, open a new Ganache environment and import the truffle-config.js file. 

c. Open a terminal change the path to the project root folder.  

d. Run: truffle compile. 

e. Run: truffle migrate --reset --network development (take note of the deployed contract address)  

f. Confirm RPC server is http://127.0.0.1:7546 in Ganache 

g. Configure MetaMask to connect to the local Ganache network (RPC URL: http://127.0.0.1:7546, Chain ID:1337).  

h. Open a new terminal change directory to backend folder: run  

$env:WS\_PROVIDER="ws://127.0.0.1:7546" 

node index.js 

i. Open a new terminal change directory to frontend folder: run  

>> npm i -g http-server      

&nbsp;# if not installed 

>> http-server -p 8080 

### 3\. Using the Web UI  

a. Open frontend/index.html in a browser.  

b. Connect MetaMask when prompted.  

c. Paste the deployed SimpleERC20 contract address and event signature Transfer(address,address,uint256).  

d. Click Subscribe to start listening for events.  

### 4\. Testing Events  

a. Open another terminal: truffle console --network development  

b. Inside console, run: const accounts = await web3.eth.getAccounts() 

c. Then: const token = await SimpleERC20.deployed() 

d. Trigger event: await token.transfer(accounts\[1], 1000, { from: accounts\[0] })  

e. Return to the browser and check that the event appears in the table.  

### 5\. Troubleshooting  

a. If no events show, check Ganache is running and backend is started.  

b. If MetaMask does not connect, verify the RPC URL and chain ID.  

c. If contract is not deployed, re-run: truffle migrate --reset 

