const fs         = require('fs');
const jsforce    = require('jsforce');
const dayjs      = require('dayjs');
const isBetween  = require('dayjs/plugin/isBetween');
const { transferableAbortSignal } = require('util');
const { Resolver } = require('dns');
const { resolve } = require('path');

var conn;
var config;

const template_mod_functions = {
    'add': (x, v) => {return x + v},
    'sub': (x, v) => {return x - v}
};

var template_modifications = [];

const add_template_modification = (h, fn, k, v) => {
    var mod_object = { hash: h, f: fn, key: k, value: v };
    console.log("Adding Template Mod: ");
    console.log(mod_object);
    template_modifications.push(mod_object);
};

const modify_template_value_output = (template, key, value, mod_function) => {
    var x = template[key];
    template[key] = mod_function(x, value);

    return template;
};

const fetch_parties = (fetch_callback) => {
    // Create an table to store the party data
    var parties = {}; //hash table
    const week_start = dayjs().startOf('week');
    const week_end   = week_start.add(8, 'day');
    
    // Execute a query to retrieve party data from the Salesforce API
    var query = conn.query(`SELECT Name,
                               Bnow__Booking_Description__c, 
                               Bnow__Customer_Email__c, 
                               Bnow__Customer_Full_Name__c,
                               Bnow__Balance_Paid__c, 
                               Bnow__P_L_Date__c, 
                               Bnow__Booking_Time__c,
                               Bnow__Status__c,
                               Bnow__Room__c
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

        // Use the dayjs isBetween method to determine if the party date is within the current week
        if(date.isBetween(week_start, week_end) && (date.isSame(dayjs()) || date.isAfter(dayjs())) && record.Bnow__Status__c != "Cancelled") {
            var booking_id = get_booking_sfid(record);
            console.log(booking_id);
            // If the party date is within the current week, add the party data to the parties hashtable
            parties[booking_id] = record;
        }
    })
    // Handle the query end event
    .on("end", function() {
        // Log the total size of the database query and the total number of records fetched
        console.log("total in database : " + query.totalSize);
        console.log("total fetched : " + query.totalFetched);

        // Call the callback function to return the party data
        fetch_callback(parties);
    })
    // Handle the query error event
    .on("error", function(err) {
        // Log the error
        console.error(err);
    })
    // Run the query with the specified parameters
    .run({ autoFetch : true, maxFetch : 64 });
};

/**
 * process_parties - Retrieve all parties from the Salesforce API and store them in an array
 * @param {Function} callback - Callback function to return the party data
 * TODO: This is highly inefficient, need to combine the info_query into the query used in fetch_parties.
 */
const process_parties = (callback) => {
	//Get party data from salesforce
	fetch_parties((parties) => {
		//fetch question data from salesforce attach to corresponding bookings
		var info_query = conn.query(`
		SELECT Name, 
			   Bnow__Answer__c,
			   Bnow__Answer_Set__c,	
			   Bnow__Question__c,
			   Bnow__Question_Text__c,
			   Bnow__Booking__c
		FROM   Bnow__Answer__c
		ORDER BY 
			   Name DESC`)
		.on('record', (record) => {
            var booking_id = record.Bnow__Booking__c;
            
			if(parties.hasOwnProperty(booking_id)) {
				if(!parties[booking_id].hasOwnProperty('questions')) {
					//If the booking has no questions property, create an array to store questions
					parties[booking_id]['questions'] = [];
				}

                if(!parties[booking_id].hasOwnProperty('payment_link')) { 
                    parties[booking_id]['payment_link'] = null;
                }

				// If the parties hashtable contains a booking matching a question, add that question
				// to the corresponding booking
				parties[booking_id].questions.push(record);
                parties[booking_id].payment_link = config.payment_link + booking_id;
			}
		})
		.on('end', () => {
            //TODO: Query booking room data
			callback(parties);
		})
		.on('error', (error) => {
			throw error;
		})
		.run({autoFetch: true, maxFetch: parties.length * 2});
	});
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
const get_jumpers = (desc) => {
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
 * Grab the Salesforce ID from a booking
 * @param {object} booking - a Bnow__Booking__c Record
 * @returns {number} Booking Salesforce ID
 */
const get_booking_sfid = (booking) => {
	var url = booking.attributes.url;
	var parts = url.split('/');
	
	var id = parts[parts.length - 1];
	return id;
}

/**
 * Build an email body from a party object
 * @param {Object} party - The party object with information to populate the template
 * @returns {string} The populated email body
 */
const build_email_body = (party) => {
    //add_template_modification('a022e000002FKphAAG', 'add', 'jumpers', 1);

    console.log("MoveXSF::MXSF::build_email_body()");
    // Read the HTML template from the file system
    var body = fs.readFileSync('./templates/party.html', 'utf8');

    // Extract party information from the party object
    var bkn  = party.Name;
    var name = party.Bnow__Customer_Full_Name__c;
    var date = party.Bnow__P_L_Date__c.replaceAll('-', '/');
    var time = dayjs('1/1/1 ' + party.Bnow__Booking_Time__c).format('hh:mm a') ;
	var payment = (party.Bnow__Balance_Paid__c <= 100) ? " " : "Just a note, you still need to pay your deposit which you can do <a href=\""+party.payment_link +"\">here</a>.<br>";
    
	var child_name = party.questions[0].Bnow__Answer__c;
	var child_age  = party.questions[1].Bnow__Answer__c;
	
    // Extract the number of jumpers from the party description
    var jumpers = get_jumpers(party.Bnow__Booking_Description__c);
    // Replace placeholders in the HTML template with actual values
    var template = {
        'bkn' : bkn, 
        'name': name, 
        'date': date, 
        'time': time, 
        'jumpers': jumpers, 
        'child_age': child_age, 
        'child_name': child_name, 
        'payment': payment 
    }; 

    //Apply record modifications from the webclient to the email template data.
    var hash = get_booking_sfid(party);

    var modded_template = template;
    for(var m in template_modifications) {
        var modification = template_modifications[m];
        if(modification.hash == hash) {
            console.log("Applying modification: ");
            console.log(modification);
            console.log("to");
            console.log(modded_template);

            var modded_template = modify_template_value_output(modded_template, 
                                        modification.key, 
                                        modification.value,
                                        template_mod_functions[modification.f]); 
            console.log("result = ");
            console.log(modded_template);
        }   
    }
    // Return the populated email body
    var populated = populate_template(body, modded_template);
    return populated;
};

/**
 * send_party_email - Sends the party confirmation email to the customer
 *
 * @param {Object} party - The party object
 */
async function send_party_email(party) {
    console.log("MoveXSF::MXSF::send_party_email()");
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
    if(response['soapenv:Envelope']['soapenv:Body'].sendEmailResponse.result.success == 'true') {
        console.log("MoveXSF::MXSF: Sent party email to " + party.Bnow__Customer_Email__c + " successfully");

        resolve(response['soapenv:Envelope']['soapenv:Body'].sendEmailResponse.result.success);
    } else {
        console.log("MoveXSF::MXSF: Party email to " + party.Bnow__Customer_Email__c + " failed");
        console.log(response['soapenv:Envelope']['soapenv:Body'].sendEmailResponse);
        reject(response['soapenv:Envelope']['soapenv:Body'].sendEmailResponse.result.failure);
    }

    //clear template mods everytime we send out the batch of emails.
    template_modifications = [];
}

function sanitizeForXml(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

module.exports = {
    'get_parties': get_parties,
    'connect': connect,
    'send_email':  send_party_email,
    'get_jumpers': get_jumpers,
    'add_template_modification': add_template_modification,
    'get_booking_sfid': get_booking_sfid
}; 