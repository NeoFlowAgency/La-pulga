
const { useState } = React;


function TeleAviveMenu(props) {
  
  return React.createElement(
    "div",
    { style: { fontFamily: "sans-serif", height: "100vh", backgroundColor: "#112ca5", display: "flex", justifyContent: "center", alignItems: "center" } },
    React.createElement(
      "div",
      { style: { backgroundColor: "white", padding: "40px", borderRadius: "16px", textAlign: "center" } },
      React.createElement("img", { src: "assets/star.png", alt: "Polga", width: 50, height: 50 }),
      React.createElement("h1", null, "Polga Clicker"),
      React.createElement("p", null, "Bienvenue a Tel avive ! ne fait pas tomber tes pieces."),
      React.createElement("p", null, "josephet vole les pieces!"),
      React.createElement(
        "button",
        { onClick: props.onStartGame, style: { padding: "10px 20px", backgroundColor: "#164faa", color: "white", border: "none", borderRadius: "8px", cursor: "pointer" } },
        "Jouer"
      )
    )
  );
}


function ClickerGame(props) {
  

  function handleStarClick() {
    
    props.setScore(props.score + props.pointsPerClick);
  }

  function handleUpgrade() {
    
    if (props.score >= 10) {
      props.setScore(props.score - 10);
      props.setPointsPerClick(props.pointsPerClick + 1);
    }
  }

  return React.createElement(
    "div",
    { style: { fontFamily: "sans-serif", height: "100vh", backgroundColor: "#112ca5", display: "flex", justifyContent: "center", alignItems: "center" } },
    React.createElement(
      "div",
      { style: { backgroundColor: "white", padding: "30px", borderRadius: "16px", textAlign: "center", position: "relative" } },
      React.createElement(
        "button",
        { onClick: props.onBack, style: { position: "absolute", top: "10px", left: "10px" } },
        "Retour"
      ),
      React.createElement("h1", null, "Polga Clicker"),
      React.createElement("p", null, "Pieces: " + props.score),
      React.createElement(
        "img",
        { src: "assets/star.png", width: 150, height: 150, onClick: handleStarClick, style: { cursor: "pointer" } }
      ),
      React.createElement(
        "div",
        null,
        React.createElement(
          "button",
          { onClick: handleUpgrade, style: { marginTop: "10px" } },
          "sirconcire (+1, cout 10)"
        ),
        React.createElement("p", null, "pieces par clic: " + props.pointsPerClick)
      )
    )
  );
}


function App() {
  
  const [currentPage, setCurrentPage] = useState("menu");
  const [score, setScore] = useState(0);
  const [pointsPerClick, setPointsPerClick] = useState(1);

  function startGame() {
    setCurrentPage("game");
  }

  function goBack() {
    setCurrentPage("menu");
  }

  if (currentPage === "menu") {
    return React.createElement(TeleAviveMenu, { onStartGame: startGame });
  } else {
    return React.createElement(ClickerGame, {
      score: score,
      setScore: setScore,
      pointsPerClick: pointsPerClick,
      setPointsPerClick: setPointsPerClick,
      onBack: goBack,
    });
  }
}


const rootElement = document.getElementById("root");
const root = ReactDOM.createRoot(rootElement);
root.render(React.createElement(App));



