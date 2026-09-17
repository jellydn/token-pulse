// biome-ignore lint/complexity/useArrowFunction: Classic functions support older Kindle browsers.
(function () {
  var intervalMilliseconds = 10 * 60 * 1000;
  var dashboard = document.getElementById("kindle-dashboard");
  var button = document.getElementById("kindle-refresh");
  var status = document.getElementById("kindle-refresh-status");

  function setStatus(message) {
    if (status) status.innerHTML = message;
  }

  function refresh() {
    if (!dashboard) return;
    if (button) button.disabled = true;
    setStatus("Updating&hellip;");

    var request = new XMLHttpRequest();
    // biome-ignore lint/style/useTemplate: String concatenation supports older Kindle browsers.
    request.open("GET", "/partials/kindle?_=" + Date.now(), true);
    // biome-ignore lint/complexity/useArrowFunction: Classic functions support older Kindle browsers.
    request.onreadystatechange = function () {
      if (request.readyState !== 4) return;
      if (button) button.disabled = false;

      if (request.status >= 200 && request.status < 300) {
        if (dashboard.innerHTML !== request.responseText) {
          dashboard.innerHTML = request.responseText;
        }
        setStatus("Updated. Auto-refreshes every 10 minutes");
        return;
      }

      setStatus("Update failed. Showing the last available data");
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
