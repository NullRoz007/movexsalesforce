var parties_global = [];
var original_values = {'hash': {'key': 'value'}}; //example

const http_get = (url) => {
    var xmlHttp = new XMLHttpRequest();
    xmlHttp.open( "GET", url, false ); // false for synchronous request
    xmlHttp.send( null );
    return xmlHttp.responseText;
}

const http_post = (url, data) => {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
    xhr.onload = function () {
        // log response
        console.log(this.responseText);
    };

    xhr.send(data);
};

const get_booking_sfid = (booking) => {
	var url = booking.attributes.url;
	var parts = url.split('/');
	
	var id = parts[parts.length - 1];
	return id;
}

const create_vmods = (party) => {
    var hash = get_booking_sfid(party);
    var func = "add";
    var key = "jumpers";
    var server_value = parseInt(original_values[hash][key]);
    var client_value = parseInt($(`#${hash}-jumpers`).val());
    var jumpers_diff = client_value - server_value;
    
    if(jumpers_diff == 0) return [];

    var mod_string = `hash=${hash}&f=${func}&key=${key}&value=${jumpers_diff}`;
    return [mod_string];
}

const send_emails = () => {
    var mod = {hash: 'a022e000002FKphAAG', f: 'add', key: 'jumpers', value: 1}
    console.log("Resolving values, please wait...");
    for(p in parties_global) {
        var hash = get_booking_sfid(parties_global[p]);
        var mods = create_vmods(parties_global[p]);

        for(m in mods) {
            var mod = mods[m];
            console.log(mod);
            http_post("/mod", mod);
        }
    }

    var send_result = JSON.parse(http_get("/send"));
    var successful = 0;
    var failed     = 0;
    
    send_result.forEach(result => {
        if(result.result == "success") successful++;
        else failed++;
    });

    alert(successful + " sent.\n"+failed+" failed.\n");
    
};

$(document).ready(function() {
    parties_global = JSON.parse(http_get("/parties"));
    var table = http_get('/gentable');
    $('#parties-table').html(table);
    $('#bookings-table-head').addClass('table-dark');

    for(p in parties_global) {
        var party = parties_global[p];
        var hash = get_booking_sfid(party);
        var value = $(`#${hash}-jumpers`).val();
        console.log("value: "+value)
        original_values[hash] = {'jumpers': value};
    }
});