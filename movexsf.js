const fs         = require('fs');
const jsforce    = require('jsforce');
const dayjs      = require('dayjs');
const isBetween  = require('dayjs/plugin/isBetween');
const { transferableAbortSignal } = require('util');

var conn;
var config;

/**
 * process_parties - Retrieve all parties from the Salesforce API and store them in an array
 * @param {Function} callback - Callback function to return the party data
 */
const process_parties = (callback) => {
    // Create an array to store the party data
    var parties = [];
    // Execute a query to retrieve party data from the Salesforce API
    var query = conn.query(`SELECT Bnow__Booking_Description__c, 
                                   Bnow__Customer_Email__c, 
                                   Bnow__Customer_Full_Name__c, 
                                   Bnow__P_L_Date__c, 
                                   Bnow__Booking_Time__c 
                            FROM   Bnow__Booking__c 
                            WHERE 
                                   Bnow__Booking_Description__c LIKE '%Party%' 
                            ORDER  BY 
                                   Bnow__P_L_Date__c DESC`)
        // Handle the query record event
        .on("record", function(record) {
            // Use the dayjs library to parse the date of the party
            const date       = dayjs(record.Bnow__P_L_Date__c);
            // Use the dayjs library to calculate the start and end of the current week
            const week_start = dayjs().startOf('week');
            const week_end   = dayjs().endOf('week');

            // Use the dayjs isBetween method to determine if the party date is within the current week
            if(date.isBetween(week_start, week_end)) {
                // If the party date is within the current week, add the party data to the parties array
                parties.push(record);
            }
    })
    // Handle the query end event
    .on("end", function() {
        // Log the total size of the database query and the total number of records fetched
        console.log("total in database : " + query.totalSize);
        console.log("total fetched : " + query.totalFetched);

        // Call the callback function to return the party data
        callback(parties);
    })
    // Handle the query error event
    .on("error", function(err) {
        // Log the error
        console.error(err);
    })
    // Run the query with the specified parameters
    .run({ autoFetch : true, maxFetch : 4000 });
};

// extend the dayjs library with the isBetween method
dayjs.extend(isBetween);

/**
 * connect - Connect to the Salesforce API using the provided configuration.
 * 
 * @param {Object} conf - The configuration object containing the Salesforce API credentials.
 * @param {function} callback - The callback function to be executed after successful connection to the API.
 */
const connect = (conf, callback) => {
    //populate Salesforce config
    config = conf;
    module.exports['config'] = conf;

    // Create a connection object for the Salesforce API
    conn = new jsforce.Connection({
        loginUrl : 'https://login.salesforce.com/'
    });
    
    // Login to Salesforce
    conn.login(config.username, config.password + config.security, function(err, userInfo) {
        // Return an error if there's any
        if (err) { return console.error(err); }
    
        console.log(conn.accessToken);
        console.log(conn.instanceUrl);
    
        console.log("User ID: " + userInfo.id);
        console.log("Org ID: " + userInfo.organizationId);

        callback();
    });
}

/**
 * get_parties - Connect to the Salesforce API and retrieve this weeks parties
 * @param {Function} callback - Callback function to return the party data
 */
const get_parties = (callback) => {   
    // Call the process_parties function
    process_parties((parties) => {
        // Call the callback function with the parties array
        callback(parties);
    });
                                                
};

/**
 * Replace placeholders in a string with given values.
 * 
 * @param {String} template - The string with placeholders to be populated.
 * @param {Object} values - Key-value pairs with the placeholder names as keys and values to be used to replace the placeholders.
 * @return {String} The populated string.
 */
const populate_template = (template, values) => {
    for(v in values) {
        // Replace the placeholder "${v}" in the template string with the value in the values object
        template = template.replace("${"+v+"}", values[v]);
    }

    return template;
};

/**
 * Extract the number of jumpers from a booking description
 * @param {string} desc - The booking description
 * @returns {number} The number of jumpers
 */
const extract_jumpers_from_description = (desc) => {
    var products = desc.split('\n');
    var total = 0;
    for(p in products) {
        var product = products[p];

        // Extract the number of jumpers from the product string
        var numString = product.split(' ')[0].replace('x', '');
        var num = parseInt(numString);

        total += num;
    }

    return total;
}

/**
 * Build an email body from a party object
 * @param {Object} party - The party object with information to populate the template
 * @returns {string} The populated email body
 */
const build_email_body = (party) => {
    // Read the HTML template from the file system
    var body = fs.readFileSync('./templates/party.html', 'utf8');

    // Extract party information from the party object
    var name = party.Bnow__Customer_Full_Name__c;
    var date = party.Bnow__P_L_Date__c.replaceAll('-', '/');
    var time = dayjs('1/1/1 ' + party.Bnow__Booking_Time__c).format('hh:mm a') ;

    // Extract the number of jumpers from the party description
    var jumpers = extract_jumpers_from_description(party.Bnow__Booking_Description__c);

    // Replace placeholders in the HTML template with actual values
    var template = populate_template(body, {'name': name, 'date': date, 'time': time, 'jumpers': jumpers});

    // Return the populated email body
    return template;
};

/**
 * send_party_email - Sends the party confirmation email to the customer
 *
 * @param {Object} party - The party object
 */
async function send_party_email(party) {
    console.log(party);
    // Build the email template from the party object
    const template = build_email_body(party);

    // Build the body of the email request
    const body = `
    <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:enterprise.soap.sforce.com" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <soapenv:Header>
         <urn:SessionHeader>
            <urn:sessionId>${conn.accessToken}</urn:sessionId>
         </urn:SessionHeader>
      </soapenv:Header>
      <soapenv:Body>
         <urn:sendEmail>
            <urn:messages xsi:type="urn:SingleEmailMessage">
               <urn:subject>MoveX Birthday Party Confirmation!</urn:subject>
               <urn:htmlBody>${sanitizeForXml(template)}</urn:htmlBody>
               <urn:toAddresses>${party.Bnow__Customer_Email__c}</urn:toAddresses>
            </urn:messages>
         </urn:sendEmail>
      </soapenv:Body>
    </soapenv:Envelope>
    `;

    // Send the email request
    var response = await conn.request({
            method: 'POST',
            url: `${conn.instanceUrl}/services/Soap/c/${conn.version}`,
            body,
            headers: {
                'Content-Type': 'text/xml;charset=utf-8',
                Accept: 'text/xml;charset=utf-8',
                SOAPAction: '""',
            },
        },
        { responseType: 'text/xml' }
    );

    // Log the response for debugging purposes
    console.log(JSON.stringify(response, null, 2));
}

function sanitizeForXml(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

module.exports = {
    'get_parties': get_parties,
    'connect': connect,
    'send_email':  send_party_email
};