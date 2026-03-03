const { useState } = React;

function App() {
  const [score, setScore] = useState(0);
  const [pointsPerClick, setPointsPerClick] = useState(1);

  function handleClick() {
    setScore((current) => current + pointsPerClick);
  }

  function buyUpgrade() {
    const cost = 10;
    setScore((current) => {
      if (current < cost) {
        return current;
      }
      setPointsPerClick((value) => value + 1);
      return current - cost;
    });
  }

  const appStyle = {
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    minHeight: "100vh",
    margin: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#112ca5",
  };

  const cardStyle = {
    backgroundColor: "#ffffff",
    padding: "24px 28px",
    borderRadius: "16px",
    boxShadow: "0 10px 30px #112ca5",
    textAlign: "center",
    border: "1px solid #e2e8f0",
  };

  const titleStyle = {
    margin: "0 0 8px",
    fontSize: "24px",
    color: "#0f172a",
  };

  const scoreStyle = {
    margin: "0 0 16px",
    fontSize: "18px",
    color: "#1e293b",
  };

  const mainButtonStyle = {
    border: "none",
    backgroundColor: "transparent",
    cursor: "pointer",
    marginBottom: "16px",
  };

  const upgradeButtonStyle = {
    padding: "10px 14px",
    borderRadius: "999px",
    border: "1px solid #164faa",
    backgroundColor: "#164faa",
    color: "white",
    fontSize: "14px",
    cursor: "pointer",
  };

  const infoStyle = {
    marginTop: "8px",
    fontSize: "12px",
    color: "#64748b",
  };

  return React.createElement(
    "div",
    { style: appStyle },
    React.createElement(
      "div",
      { style: cardStyle },
      React.createElement("h1", { style: titleStyle }, "Polga Clicker"),
      React.createElement("p", { style: scoreStyle }, "Piece : ", score),
      React.createElement(
        "button",
        { onClick: handleClick, style: mainButtonStyle },
        React.createElement("img", {
          src: "assets/star.png",
          alt: "Étoile",
          width: 160,
          height: 160,
        })
      ),
      React.createElement(
        "div",
        null,
        React.createElement(
          "button",
          { onClick: buyUpgrade, style: upgradeButtonStyle },
          "Améliorer (+1 par clic, coût 10)"
        ),
        React.createElement(
          "div",
          { style: infoStyle },
          "Piece par clic : ",
          pointsPerClick
        )
      )
    )
  );
}

const rootElement = document.getElementById("root");
const root = ReactDOM.createRoot(rootElement);
root.render(React.createElement(App));

