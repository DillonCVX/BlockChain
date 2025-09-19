// Make functions globally available
window.login = async function() {
  const username = document.getElementById("username").value;
  if (!username) {
    alert("Please enter a username!");
    return;
  }

  if (window.ethereum) {
    try {
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });

      console.log("Wallet connected:", accounts[0]);

      // Save user info in memory
      window.currentUser = { username, wallet: accounts[0] };

      // Navigate to the main app
      window.location.hash = "#/";
      window.render(); // Use window.render to ensure it's globally accessible

    } catch (err) {
      console.error("MetaMask connection failed", err);
      alert("Failed to connect wallet. Please try again.");
    }
  } else {
    alert("MetaMask not detected! Please install it.");
  }
};

// Optional: Logout function to clear user session
window.logout = function() {
  window.currentUser = null;
  window.location.hash = "#/login";
  window.render(); // Use window.render to ensure it's globally accessible
};
