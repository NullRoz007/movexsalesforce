const http_get = (url) => {
    var xmlHttp = new XMLHttpRequest();
    xmlHttp.open( "GET", url, false ); // false for synchronous request
    xmlHttp.send( null );
    return xmlHttp.responseText;
}

const send_emails = () => {
    http_get("/send");
};

$(document).ready(function() {
    var table = http_get('/gentable');
    $('#parties-table').html(table);
    $('#bookings-table-head').addClass('table-dark');
});