// biome-ignore lint/complexity/useArrowFunction: Classic functions support older Kindle browsers.
(function () {
  var intervalMilliseconds = 10 * 60 * 1000;
  var dashboard = document.getElementById("kindle-dashboard");
  var button = document.getElementById("kindle-refresh");
  var status = document.getElementById("kindle-refresh-status");
  var refreshing = false;

  function setStatus(message) {
    if (status) status.innerHTML = message;
  }

  function refresh() {
    if (!dashboard || refreshing) return;
    refreshing = true;
    if (button) button.disabled = true;
    setStatus("Updating&hellip;");

    var request = new XMLHttpRequest();
    var complete = false;
    function finish() {
      if (complete) return false;
      complete = true;
      refreshing = false;
      if (button) button.disabled = false;
      return true;
    }

    // biome-ignore lint/style/useTemplate: String concatenation supports older Kindle browsers.
    request.open("GET", "/partials/kindle?_=" + Date.now(), true);
    request.timeout = 30000;
    // biome-ignore lint/complexity/useArrowFunction: Classic functions support older Kindle browsers.
    request.onreadystatechange = function () {
      if (request.readyState !== 4) return;
      if (!finish()) return;

      if (request.status >= 200 && request.status < 300) {
        if (dashboard.innerHTML !== request.responseText) {
          dashboard.innerHTML = request.responseText;
        }
        setStatus("Updated. Auto-refreshes every 10 minutes");
        return;
      }

      setStatus("Update failed. Showing the last available data");
    };
    // biome-ignore lint/complexity/useArrowFunction: Classic functions support older Kindle browsers.
    request.ontimeout = function () {
      if (!finish()) return;
      setStatus("Update timed out. Showing the last available data");
    };
    request.send(null);
  }

  if (button) {
    if (button.addEventListener) {
      button.addEventListener("click", refresh, false);
    } else if (button.attachEvent) {
      button.attachEvent("onclick", refresh);
    }
  }

  window.setInterval(refresh, intervalMilliseconds);
})();
