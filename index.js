const MoveXSF = require("./movexsf");
const WebService = require("./webservice");
const config = require("./config.json");

const run = () => {  
    console.log("MoveXSF: Establishing Connection to Salesforce...");
    MoveXSF.connect(config, () => {
        console.log("MoveXSF: Connected to Salesforce!");
        WebService.start_webservice(MoveXSF, () => {
            console.log("MovexSF: WebService Started!");
        });
    });
};

run();
