const Table = require('table-builder');
const express = require('express');
const bodyParser = require('body-parser');

// Import express framework and create an instance of the express app
const app = express();

// Define the port for the express app to run on
const port = 3000;

// Declare a variable to store the MoveXSF instance
var mxsf;

// Serve static files from the "public" folder
app.use(express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

/**
 * GET /gentable endpoint.
 * This endpoint retrieves the parties from the MoveXSF instance and 
 * generates a table using the table-builder library and sends the 
 * rendered table as the response.
 */
app.get('/gentable', (req, res) => {
    console.log("MoveXSF::WebService: GET /gentable");
    // Call the get_parties function on the MoveXSF instance
    mxsf.get_parties(parties => {
		var headers_array = [];
        // Add the "url" property to each party
        for(p in parties) {
            var party = parties[p];
            var hash = mxsf.get_booking_sfid(party);
            var jumpers = mxsf.get_jumpers(party.Bnow__Booking_Description__c);

            party['url'] = party.attributes.url;
			party['number_jumpers'] = `<input id="${hash}-jumpers" type="number" value=${jumpers}>`
            headers_array.push(party);
        }
		
        // Define the headers for the table
        var headers = { 
            "Name": "BKN",
            "Bnow__Customer_Full_Name__c" : "Customer", 
            "Bnow__Customer_Email__c": "Email Address", 
            "Bnow__P_L_Date__c": "Date", 
            "Bnow__Booking_Time__c": "Time",
            "number_jumpers": "Jumpers"
        };

        // Create a table using the table-builder library and render it
        var table = (new Table({'class': 'table'}))
                    .setHeaders(headers)
                    .setData(headers_array)
                    .render();
        
        // Add custom ids to the table elements for styling
        table = table.replace("<table", '<table id="bookings-table"');
        table = table.replace("<thead", '<thead id="bookings-table-head"');

        // Send the rendered table as the response
        res.send(table);
    });
});

app.get('/schedule', (req, res) => {
    console.log("MoveXSF::WebService: GET /schedule");
    mxsf.get_parties(parties => {
        console.log(parties);
    });
});

app.post('/mod', (req, res) => {
    console.log("MoveXSF::WebService: POST /mod");
    var mod = req.body;
    
    mxsf.add_template_modification(mod.hash, mod.f, mod.key, parseInt(mod.value));
});

/**
 * GET /send endpoint.
 * This endpoint retrieves the parties from the MoveXSF instance and 
 * sends an email to each party using the send_email function of the 
 * MoveXSF instance.
 */
app.get('/send', (req, res) => {
    console.log("MoveXSF::WebService: GET /send");
    console.warn("MoveXSF::WebService: TODO: Change to POST Request!!!");
    
    // Call the get_parties function on the MoveXSF instance
    mxsf.get_parties(parties_hashtable => {
		var parties = [];
		for(p in parties_hashtable) { 
            parties.push(parties_hashtable[p]);
        }
		
        var processed = 0;
        var results = [];
        // Send an email to each party using the send_email function of the MoveXSF instance
        parties.forEach(party => {
            if(mxsf.config.testing) party.Bnow__Customer_Email__c = mxsf.config.testing_address;
            
            mxsf.send_email(party)
            .then(response => { //send worked
                results.push({'result': 'success', 'party': party});
            })
            .catch(response => { //failed
                results.push({'result': 'failure', 'party': party});
            })
            .finally(() => {
                processed += 1;

                if(processed == parties.length) {
                    res.send(JSON.stringify(results));
                }
            });
        });

    });
});

/**
 * GET /parties endpoint
 * 
 * This endpoint retrieves the parties from the MoveXSF instance,
 * creates a JSON object representing the parties array and then
 * sends it as the response.
 */
app.get('/parties', (req, res) => {
    console.log("MoveXSF::WebService: GET /parties");
    mxsf.get_parties(parties => {
        var body = JSON.stringify(parties);
        res.send(body);
    });
});

/**
 * Start the web service
 * 
 * @param {Object} MoveXSF - The MoveXSF instance to use
 * @param {Function} callback - Callback to be called when the web service has started
 */
const start_webservice = (MoveXSF, callback) => {
    // Start the app and listen on the specified port
    app.listen(port, () => {
        // Log a message indicating the app is running
        console.log(`MoveXSF::WebService: App running on port ${port}!`);
        // Store the MoveXSF instance
        mxsf = MoveXSF;
        // Log a message indicating the MXSF instance was attached
        console.log("MoveXSF::WebService: Attached MXSF instance!")
        // Call the provided callback
        callback();
    });
};

module.exports = {
    'start_webservice': start_webservice
}
