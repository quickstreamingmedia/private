const GO_BUTTON_START = "Publish";
const GO_BUTTON_STOP = "Stop";

function getParameterByName(name, url) {
    if (!url) url = window.location.href;
    name = name.replace(/[\[\]]/g, "\\$&");
    var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
        results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, " "));
}
var streamgv  = getParameterByName('room');
var localVideo = null;
var remoteVideo = null;
var peerConnection = null;
var peerConnectionConfig = {'iceServers': []};
var localStream = null;
var wsURL = "wss://acropacific.ga:8443/webrtc-session.json";
var wsConnection = null;
var streamInfo = {applicationName:"webrtc", streamName:streamgv, sessionId:"[empty]"};
var userData = {param1:"value1"};
var videoBitrate = 400;
var audioBitrate = 64;
var videoFrameRate = "29.97";
var userAgent = null;
var newAPI = false;

navigator.getUserMedia = navigator.getUserMedia || navigator.mozGetUserMedia || navigator.webkitGetUserMedia;
window.RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
window.RTCIceCandidate = window.RTCIceCandidate || window.mozRTCIceCandidate || window.webkitRTCIceCandidate;
window.RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription || window.webkitRTCSessionDescription;

function pageReady()
{
    var cookieWSURL = $.cookie("webrtcPublishWSURL");
    if (cookieWSURL === undefined)
    {
		cookieWSURL = wsURL;
		$.cookie("webrtcPublishWSURL", cookieWSURL);
	}
	console.log('cookieWSURL: '+cookieWSURL);

    var cookieApplicationName = $.cookie("webrtcPublishApplicationName");
    if (cookieApplicationName === undefined)
    {
		cookieApplicationName = streamInfo.applicationName;
		$.cookie("webrtcPublishApplicationName", cookieApplicationName);
	}
	console.log('cookieApplicationName: '+cookieApplicationName);

    var cookieStreamName = $.cookie("webrtcPublishStreamName");
    if (cookieStreamName === undefined)
    {
		cookieStreamName = streamInfo.streamName;
		$.cookie("webrtcPublishStreamName", cookieStreamName);
	}
	console.log('cookieStreamName: '+cookieStreamName);

	var cookieVideoBitrate = $.cookie("webrtcPublishVideoBitrate");
    if (cookieVideoBitrate === undefined)
    {
		cookieVideoBitrate = videoBitrate;
		$.cookie("webrtcPublishVideoBitrate", cookieVideoBitrate);
	}
	console.log('cookieVideoBitrate: '+cookieVideoBitrate);

	var cookieAudioBitrate = $.cookie("webrtcPublishAudioBitrate");
    if (cookieAudioBitrate === undefined)
    {
		cookieAudioBitrate = audioBitrate;
		$.cookie("webrtcPublishAudioBitrate", cookieAudioBitrate);
	}
	console.log('cookieAudioBitrate: '+cookieAudioBitrate);

		var cookieVideoFrameRate = $.cookie("webrtcPublishVideoFrameRate");
    if (cookieVideoFrameRate === undefined)
    {
		cookieVideoFrameRate = videoFrameRate;
		$.cookie("webrtcPublishVideoFrameRate", cookieVideoFrameRate);
	}
	console.log('cookieVideoFrameRate: '+cookieVideoFrameRate);

	$('#sdpURL').val(cookieWSURL);
	$('#applicationName').val(cookieApplicationName);
	$('#streamName').val(cookieStreamName);
	$('#videoBitrate').val(cookieVideoBitrate);
	$('#audioBitrate').val(cookieAudioBitrate);
	$('#videoFrameRate').val(cookieVideoFrameRate);
	userAgent = $('#userAgent').val().toLowerCase();

	if ( userAgent == null )
	{
		userAgent="unknown";
	}

	$("#buttonGo").attr('value', GO_BUTTON_START);

	localVideo = document.getElementById('localVideo');

	/*
		// firefox
		video: {
			width: { min: 1280, ideal: 1280, max: 1920 },
			height: { min: 720, ideal: 720, max: 1080 }
		  },

		// chrome
		video: {
			mandatory: {
				minWidth: 1280,
				maxWidth: 1280,
				minHeight: 720,
				maxHeight: 720,
				minFrameRate: 30,
				maxFrameRate: 30
			}
		},

		video: {
			mandatory: {
				minAspectRatio: 1.7777777778
			}
		},

		video: true,
	*/

    var constraints =
    {
		video: true,
		audio: true,
    };

    if(navigator.mediaDevices.getUserMedia)
	{
		navigator.mediaDevices.getUserMedia(constraints).then(getUserMediaSuccess).catch(errorHandler);
		newAPI = false;
	}
    else if (navigator.getUserMedia)
    {
        navigator.getUserMedia(constraints, getUserMediaSuccess, errorHandler);
    }
    else
    {
        alert('Your browser does not support getUserMedia API');
    }

	console.log("newAPI: "+newAPI);

}

function wsConnect(url)
{
	wsConnection = new WebSocket(url);
	wsConnection.binaryType = 'arraybuffer';

	wsConnection.onopen = function()
	{
		console.log("wsConnection.onopen");

		peerConnection = new RTCPeerConnection(peerConnectionConfig);
		peerConnection.onicecandidate = gotIceCandidate;

		if (newAPI)
		{
			var localTracks = localStream.getTracks();
			for(localTrack in localTracks)
			{
				peerConnection.addTrack(localTracks[localTrack], localStream);
			}
		}
		else
		{
			peerConnection.addStream(localStream);
		}

		peerConnection.createOffer(gotDescription, errorHandler);
	}

	wsConnection.onmessage = function(evt)
	{
		console.log("wsConnection.onmessage: "+evt.data);

		var msgJSON = JSON.parse(evt.data);

		var msgStatus = Number(msgJSON['status']);
		var msgCommand = msgJSON['command'];

		if (msgStatus != 200)
		{
			$("#sdpDataTag").html(msgJSON['statusDescription']);
			stopPublisher();
		}
		else
		{
			$("#sdpDataTag").html("");

			var sdpData = msgJSON['sdp'];
			if (sdpData !== undefined)
			{
				console.log('sdp: '+msgJSON['sdp']);

				peerConnection.setRemoteDescription(new RTCSessionDescription(sdpData), function() {
					//peerConnection.createAnswer(gotDescription, errorHandler);
				}, errorHandler);
			}

			var iceCandidates = msgJSON['iceCandidates'];
			if (iceCandidates !== undefined)
			{
				for(var index in iceCandidates)
				{
					console.log('iceCandidates: '+iceCandidates[index]);

					peerConnection.addIceCandidate(new RTCIceCandidate(iceCandidates[index]));
				}
			}
		}

		if (wsConnection != null)
			wsConnection.close();
		wsConnection = null;
	}

	wsConnection.onclose = function()
	{
		console.log("wsConnection.onclose");
	}

	wsConnection.onerror = function(evt)
	{
		console.log("wsConnection.onerror: "+JSON.stringify(evt));

		$("#sdpDataTag").html('WebSocket connection failed: '+wsURL);
		stopPublisher();
	}
}

function getUserMediaSuccess(stream)
{
	console.log("getUserMediaSuccess: "+stream);
    localStream = stream;
    localVideo.src = window.URL.createObjectURL(stream);
}

function startPublisher()
{
	wsURL = $('#sdpURL').val();
	streamInfo.applicationName = $('#applicationName').val();
	streamInfo.streamName = $('#streamName').val();
	videoBitrate = $('#videoBitrate').val();
	audioBitrate = $('#audioBitrate').val();
	videoFrameRate = $('#videoFrameRate').val();
	userAgent = $('#userAgent').val().toLowerCase();

	$.cookie("webrtcPublishWSURL", wsURL, { expires: 365 });
	$.cookie("webrtcPublishApplicationName", streamInfo.applicationName, { expires: 365 });
	$.cookie("webrtcPublishStreamName", streamInfo.streamName, { expires: 365 });
	$.cookie("webrtcPublishVideoBitrate", videoBitrate, { expires: 365 });
	$.cookie("webrtcPublishAudioBitrate", audioBitrate, { expires: 365 });
	$.cookie("webrtcPublishVideoFrameRate", videoFrameRate, { expires: 365 });

	console.log("startPublisher: wsURL:"+wsURL+" streamInfo:"+JSON.stringify(streamInfo));

	wsConnect(wsURL);

	$("#buttonGo").attr('value', GO_BUTTON_STOP);
}

function stopPublisher()
{
	if (peerConnection != null)
		peerConnection.close();
	peerConnection = null;

	if (wsConnection != null)
		wsConnection.close();
	wsConnection = null;

	$("#buttonGo").attr('value', GO_BUTTON_START);

	console.log("stopPublisher");
}

function start()
{
	if (peerConnection == null)
		startPublisher();
	else
		stopPublisher();
}

function gotIceCandidate(event)
{
    if(event.candidate != null)
    {
    	console.log('gotIceCandidate: '+JSON.stringify({'ice': event.candidate}));
    }
}

function gotDescription(description)
{
	var enhanceData = new Object();

	if (audioBitrate !== undefined)
		enhanceData.audioBitrate = Number(audioBitrate);
	if (videoBitrate !== undefined)
		enhanceData.videoBitrate = Number(videoBitrate);
	if (videoFrameRate !== undefined)
		enhanceData.videoFrameRate = Number(videoFrameRate);


	description.sdp = enhanceSDP(description.sdp, enhanceData);

	console.log('gotDescription: '+JSON.stringify({'sdp': description}));

    peerConnection.setLocalDescription(description, function () {

		wsConnection.send('{"direction":"publish", "command":"sendOffer", "streamInfo":'+JSON.stringify(streamInfo)+', "sdp":'+JSON.stringify(description)+', "userData":'+JSON.stringify(userData)+'}');

    }, function() {console.log('set description error')});
}

function enhanceSDP(sdpStr, enhanceData)
{
	var sdpLines = sdpStr.split(/\r\n/);
	var sdpSection = 'header';
	var hitMID = false;
	var sdpStrRet = '';

	for(var sdpIndex in sdpLines)
	{
		var sdpLine = sdpLines[sdpIndex];

		if (sdpLine.length <= 0)
			continue;

		sdpStrRet += sdpLine;

		if (sdpLine.indexOf("m=audio") === 0)
		{
			sdpSection = 'audio';
			hitMID = false;
		}
		else if (sdpLine.indexOf("m=video") === 0)
		{
			sdpSection = 'video';
			hitMID = false;
		}
		else if (sdpLine.indexOf("a=rtpmap") == 0 )
		{
			sdpSection = 'bandwidth';
			hitMID = false;
		}

		if (sdpLine.indexOf("a=mid:") === 0 || sdpLine.indexOf("a=rtpmap") == 0 )
		{
			if (!hitMID)
			{
				if ('audio'.localeCompare(sdpSection) == 0)
				{
					if (enhanceData.audioBitrate !== undefined)
					{
						sdpStrRet += '\r\nb=CT:' + (enhanceData.audioBitrate);
						sdpStrRet += '\r\nb=AS:' + (enhanceData.audioBitrate);
					}
					hitMID = true;
				}
				else if ('video'.localeCompare(sdpSection) == 0)
				{
					if (enhanceData.videoBitrate !== undefined)
					{
						sdpStrRet += '\r\nb=CT:' + (enhanceData.videoBitrate);
						sdpStrRet += '\r\nb=AS:' + (enhanceData.videoBitrate);
						if ( enhanceData.videoFrameRate !== undefined )
							{
								sdpStrRet += '\r\na=framerate:'+enhanceData.videoFrameRate;
							}
					}
					hitMID = true;
				}
				else if ('bandwidth'.localeCompare(sdpSection) == 0 )
				{
					var rtpmapID;
					rtpmapID = getrtpMapID(sdpLine);
					if ( rtpmapID !== null  )
					{
						var match = rtpmapID[2].toLowerCase();
						if ( ('vp9'.localeCompare(match) == 0 ) ||  ('vp8'.localeCompare(match) == 0 ) || ('h264'.localeCompare(match) == 0 ) ||
							('red'.localeCompare(match) == 0 ) || ('ulpfec'.localeCompare(match) == 0 ) || ('rtx'.localeCompare(match) == 0 ) )
						{
							if (enhanceData.videoBitrate !== undefined)
								{
								sdpStrRet+='\r\na=fmtp:'+rtpmapID[1]+' x-google-min-bitrate='+(enhanceData.videoBitrate)+';x-google-max-bitrate='+(enhanceData.videoBitrate);
								}
						}

						if ( ('opus'.localeCompare(match) == 0 ) ||  ('isac'.localeCompare(match) == 0 ) || ('g722'.localeCompare(match) == 0 ) || ('pcmu'.localeCompare(match) == 0 ) ||
								('pcma'.localeCompare(match) == 0 ) || ('cn'.localeCompare(match) == 0 ))
						{
							if (enhanceData.audioBitrate !== undefined)
								{
								sdpStrRet+='\r\na=fmtp:'+rtpmapID[1]+' x-google-min-bitrate='+(enhanceData.audioBitrate)+';x-google-max-bitrate='+(enhanceData.audioBitrate);
								}
						}
					}
				}
			}
		}
		sdpStrRet += '\r\n';
	}
	return sdpStrRet;
}

function getrtpMapID(line)
{
	var findid = new RegExp('a=rtpmap:(\\d+) (\\w+)/(\\d+)');
	var found = line.match(findid);
	return (found && found.length >= 3) ? found: null;
}

function errorHandler(error)
{
    console.log(error);
}
