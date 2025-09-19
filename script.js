
// Sidebar functionality
document.addEventListener('DOMContentLoaded', function () {
  const sidebar = document.getElementById('sidebar');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const closeSidebar = document.getElementById('closeSidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');

  // Get original buttons
  // const addMemberBtn = document.getElementById('addMemberButton');
  //const resetBtn = document.getElementById('resetButton');
  //const weeklySummaryBtn = document.getElementById('weeklySummaryButton');
  //const progressChartBtn = document.getElementById('progressChartButton');

  // Get sidebar buttons
  const sidebarAddMember = document.getElementById('sidebarAddMember');
  const sidebarReset = document.getElementById('sidebarReset');
  const sidebarWeeklySummary = document.getElementById('sidebarWeeklySummary');
  const sidebarProgressChart = document.getElementById('sidebarProgressChart');
  const sidebarAppInfo = document.getElementById('sidebarAppInfo');
  const sidebarVoiceCommand = document.getElementById('sidebarVoiceCommand');
  const sidebarBadges = document.getElementById('sidebarBadges');
  const sidebarGoals = document.getElementById('sidebarGoals');
  const sidebarRewards = document.getElementById('sidebarRewards');
  const sidebarLeaderboard = document.getElementById('sidebarLeaderboard');

  // Open sidebar
  function openSidebar() {
    sidebar.classList.add('open');
    sidebarOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    document.body.classList.add('sidebar-open');
  }

  // Close sidebar
  function closeSidebarMenu() {
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('active');
    document.body.style.overflow = 'auto';
    document.body.classList.remove('sidebar-open');
  }

  // Event listeners for opening/closing sidebar
  sidebarToggle.addEventListener('click', openSidebar);
  closeSidebar.addEventListener('click', closeSidebarMenu);
  sidebarOverlay.addEventListener('click', closeSidebarMenu);

  // Close sidebar on escape key
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && sidebar.classList.contains('open')) {
      closeSidebarMenu();
    }
  });

  // Connect sidebar buttons to original button functionality
  if (sidebarAddMember) {
    sidebarAddMember.addEventListener('click', function () {
      // Open add member popup
      const addMemberPopup = document.getElementById("addMemberPopup");
      const addMemberNameInput = document.getElementById("newMemberName");
      const addMemberColorInput = document.getElementById("newMemberColor");

      if (addMemberPopup && addMemberNameInput && addMemberColorInput) {
        addMemberNameInput.value = "";
        addMemberColorInput.value = "#4a90e2";
        addMemberPopup.classList.remove("hidden");
        addMemberNameInput.focus();
      }
      closeSidebarMenu();
    });
  }

  if (sidebarReset) {
    sidebarReset.addEventListener('click', function () {
      // Call reset function directly
      if (typeof resetDailyChores === 'function') {
        resetDailyChores();
      }
      closeSidebarMenu();
    });
  }

  if (sidebarWeeklySummary) {
    sidebarWeeklySummary.addEventListener('click', function () {
      // Open weekly summary modal
      const modal = document.getElementById("weeklyModal");
      if (modal && typeof renderWeeklySummary === 'function') {
        renderWeeklySummary();
        modal.style.display = "block";
      }
      closeSidebarMenu();
    });
  }

  if (sidebarProgressChart) {
    sidebarProgressChart.addEventListener('click', function () {
      // Open progress chart modal
      const chartModal = document.getElementById("progressChartModal");
      if (chartModal && typeof updateChart === 'function') {
        chartModal.style.display = "block";
        updateChart();
      }
      closeSidebarMenu();
    });
  }

  if (sidebarAppInfo) {
    sidebarAppInfo.addEventListener('click', function () {
      // Open app info modal
      const appInfoModal = document.getElementById("appInfoModal");
      if (appInfoModal) {
        appInfoModal.style.display = "block";
      }
      closeSidebarMenu();
    });
  }

  if (sidebarVoiceCommand) {
    sidebarVoiceCommand.addEventListener('click', function () {
      const voiceModal = document.getElementById("voiceModal");
      if (voiceModal) {
        voiceModal.style.display = "block";
      }
      closeSidebarMenu();
    });
  }

  if (sidebarBadges) {
    sidebarBadges.addEventListener('click', function () {
      const badgesModal = document.getElementById("badgesModal");
      if (badgesModal && typeof renderBadges === 'function') {
        renderBadges();
        badgesModal.style.display = "block";
      }
      closeSidebarMenu();
    });
  }

  if (sidebarGoals) {
    sidebarGoals.addEventListener('click', function () {
      const goalsModal = document.getElementById("goalsModal");
      if (goalsModal && typeof renderGoals === 'function') {
        renderGoals();
        goalsModal.style.display = "block";
      }
      closeSidebarMenu();
    });
  }

  if (sidebarRewards) {
    sidebarRewards.addEventListener('click', function () {
      const rewardModal = document.getElementById("rewardModal");
      if (rewardModal && typeof renderRewards === 'function') {
        renderRewards();
        rewardModal.style.display = "block";
      }
      closeSidebarMenu();
    });
  }

  if (sidebarLeaderboard) {
    sidebarLeaderboard.addEventListener('click', function () {
      const leaderboardModal = document.getElementById("leaderboardModal");
      if (leaderboardModal && typeof renderLeaderboard === 'function') {
        renderLeaderboard();
        leaderboardModal.style.display = "block";
      }
      closeSidebarMenu();
    });
  }


  // App Info Modal close functionality
  const appInfoModal = document.getElementById("appInfoModal");
  const closeAppInfoBtn = document.getElementById("closeAppInfoModal");

  if (closeAppInfoBtn) {
    closeAppInfoBtn.addEventListener("click", () => {
      appInfoModal.style.display = "none";
    });
  }

  window.addEventListener("click", (e) => {
    if (e.target === appInfoModal) {
      appInfoModal.style.display = "none";
    }
  });

  // Add subscription functionality
  if (sidebarSubscription) {
    sidebarSubscription.addEventListener('click', function () {
      const subscriptionModal = document.getElementById("subscriptionModal");
      if (subscriptionModal) {
        subscriptionModal.style.display = "block";
        // Check subscription status when modal opens
        updateSubscriptionUI();
      }
      closeSidebarMenu();
    });
  }

  // App Info scroll controls: smooth scroll and keyboard shortcuts
  const appInfoContent = document.getElementById('appInfoContent');
  const appInfoScrollUp = document.getElementById('appInfoScrollUp');
  const appInfoScrollDown = document.getElementById('appInfoScrollDown');

  function smoothScrollBy(el, amount) {
    if (!el) return;
    el.scrollBy({ top: amount, left: 0, behavior: 'smooth' });
  }

  if (appInfoScrollUp) {
    appInfoScrollUp.addEventListener('click', function () {
      smoothScrollBy(appInfoContent, -200);
    });
  }

  if (appInfoScrollDown) {
    appInfoScrollDown.addEventListener('click', function () {
      smoothScrollBy(appInfoContent, 200);
    });
  }

  // Keyboard support when modal open
  document.addEventListener('keydown', function (e) {
    const modalVisible = appInfoModal && appInfoModal.style.display === 'block';
    if (!modalVisible) return;

    if (e.key === 'PageDown') {
      e.preventDefault();
      smoothScrollBy(appInfoContent, 400);
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      smoothScrollBy(appInfoContent, -400);
    } else if (e.key === 'Home') {
      e.preventDefault();
      if (appInfoContent) appInfoContent.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (e.key === 'End') {
      e.preventDefault();
      if (appInfoContent) appInfoContent.scrollTo({ top: appInfoContent.scrollHeight, behavior: 'smooth' });
    }
  });

  // Add this after the other event listeners
  const subscribeBtn = document.getElementById('subscribe-btn');
  const subscriptionStatus = document.getElementById('subscription-status');
  const statusText = document.getElementById('status-text');
  const manageBtn = document.getElementById('manage-subscription');

  // Your Stripe price ID - REPLACE WITH YOUR ACTUAL PRICE ID
  const PREMIUM_PRICE_ID = 'price_1S3wVYRUIN05N7XgGwg64eYU';

  // Handle subscription button click
  if (subscribeBtn) {
    subscribeBtn.addEventListener('click', async () => {
      const user = firebase.auth().currentUser;
      if (!user) {
        alert('Please sign in first');
        return;
      }

      subscribeBtn.disabled = true;
      subscribeBtn.textContent = 'Processing...';

      try {
        await subscriptionService.createSubscription(user, PREMIUM_PRICE_ID);
      } catch (error) {
        subscribeBtn.disabled = false;
        subscribeBtn.textContent = 'Subscribe Now';
      }
    });
  }

  // Check subscription status function
  async function updateSubscriptionUI() {
    const user = firebase.auth().currentUser;
    if (!user) return;

    try {
      const subscription = await subscriptionService.checkUserSubscription();

      const subscriptionContent = document.getElementById('subscription-content');
      const subscriptionSection = document.getElementById('subscription-section');

      if (subscription.isPremium) {
        // Hide pricing card, show status
        subscribeBtn.parentElement.style.display = 'none';
        subscriptionStatus.style.display = 'block';
        statusText.textContent = `Status: ${subscription.status}`;
      } else {
        // Show pricing card, hide status
        subscribeBtn.parentElement.style.display = 'block';
        subscriptionStatus.style.display = 'none';
      }
    } catch (error) {
      console.error('Error updating subscription UI:', error);
    }
  }

  // Handle manage subscription (redirect to Stripe customer portal)
  if (manageBtn) {
    manageBtn.addEventListener('click', async () => {
      // You'll need to create another API endpoint for customer portal
      // For now, redirect to a generic Stripe billing portal
      alert('Contact support to manage your subscription');
    });
  }


});
