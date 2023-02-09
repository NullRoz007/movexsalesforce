const http_get = (url) => {
    var xmlHttp = new XMLHttpRequest();
    xmlHttp.open( "GET", url, false ); // false for synchronous request
    xmlHttp.send( null );
    return xmlHttp.responseText;
}

const send_emails = () => {
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
    var table = http_get('/gentable');
    $('#parties-table').html(table);
    $('#bookings-table-head').addClass('table-dark');
});