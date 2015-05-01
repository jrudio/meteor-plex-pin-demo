PinsClient = new Mongo.Collection('pinsClient');
PinsServer = new Mongo.Collection('pinsServer');

var headers = {
  'X-Plex-Product': 'Plex+Web',
  'X-Plex-Version': '2.3.21',
  'X-Plex-Client-Identifier': 'r4zsj3rp4r4wjyvi',
  'X-Plex-Platform': 'Chrome',
  'X-Plex-Platform-Version': '41.0',
  'X-Plex-Device': 'Linux',
  'X-Plex-Device-Name': 'Plex+Web+(Chrome)',
  'Accept-Language': 'en'
};

var getPinServer = function(){
  Meteor.call('getPin', headers);
};

var checkPinServer = function(docId, requestId){
  Meteor.call('checkPin', headers, docId, requestId);
};

var getPinClient = function(){
  function reqCB(result){

    result = result.content;

    // Pin expires in 5 minutes
    plexPin.setExpireTime(result);

    // Set Pin - Use case: Send to PMS owner to authorize
    plexPin.setPin(result);

    // Set requestId of the pin page to monitor
    plexPin.setRequestId(result);

    var fields = {
      pin: plexPin.getPin(),
      expireTime: plexPin.getExpireTime(),
      requestId: plexPin.getRequestId()
    };

    // Insert into Database
    PinsClient.insert(fields);
  }

  function errCB(error){
    console.error('Error requesting PIN: ' + error);
  }

  plexPin.requestPin().then(reqCB).catch(errCB);
};

var checkPinClient = function(docId, requestId){
  var checkPinCB = function(result){
    plexPin.setAuthToken(result.content);

    var _authToken = plexPin.getAuthToken(); 

    console.log('AuthToken result: %s', _authToken);

    if(_authToken){
      // Token was authorized
      PinsClient.update(docId, { $set: { authToken: _authToken } });
      PinsClient.update(docId, { $set: { authorized: true } });
    }
    else{
      // You are not authorized
      PinsClient.update(docId, { $set: { authorized: false } });
    }
  };


  var checkPinErrorCB = function(error){
    if(/404/g.test(error)){
      var msg = 'Your PIN has expired';
      console.log(msg);
      alert(msg);
      PinsClient.update(docId, { $set: { expired: true } });
    }
    else{
      console.error('Error: %s', error);
    }
  };

  plexPin.checkPin(requestId).then(checkPinCB).catch(checkPinErrorCB);
};

var removeAllPins = function(){
  Meteor.call('removeAllPins');
};

if(Meteor.isClient) {
  var clock = new Tracker.Dependency;

  Meteor.setInterval(function(){
    clock.changed();
  }, 5000);
  plexPin = new PlexPin(headers);      

  Template.clientPins.helpers({
    clientPins: function(){
      return PinsClient.find();
    }
  });

  Template.serverPins.helpers({
    serverPins: function () {
      return PinsServer.find();
    }
  });

  Template.getPins.events({
    'click button.deleteAll': function(){
      removeAllPins();
    },
    'click button.get-pin-server': function(){
      getPinServer();
    },
    'click button.get-pin-client': function(){
      getPinClient();
    }
  });

  Template.displayPins.events({
    'click button': function(event, template){
      var buttonClass = event.currentTarget.className;
      var docId = this._id;
      var requestId = this.requestId;

      if(buttonClass === 'check-pin-server'){
        console.log('Check via Server');
        checkPinServer(docId, requestId);
      }
      else if(buttonClass === 'check-pin-client'){
        console.log('Check via Client');
        checkPinClient(docId, requestId);
      }
      else{
        return console.log('You have clicked an unexpected button');
      }
    }
  });

  Template.displayPins.helpers({
    fromNow: function(time){
      clock.depend();
      return moment(time).fromNow();
    }
  });
}

if (Meteor.isServer) {
  var plexPin = new PlexPin(headers);

  Meteor.methods({
    getPin: function(headers){
      check(headers, Object);

      var plexPin = new PlexPin(headers);

      var pinCB = Meteor.bindEnvironment(function(result){
        plexPin.setPin(result);
        plexPin.setRequestId(result);
        plexPin.setExpireTime(result);

        var fields = {
          pin: plexPin.getPin(),
          expireTime: plexPin.getExpireTime(),
          requestId: plexPin.getRequestId()
        };

        PinsServer.insert(fields);
      });

      plexPin.requestPin().then(pinCB);
    },
    checkPin: function(headers, docId, requestId){

      var checkPinCB = Meteor.bindEnvironment(function(result){
        plexPin.setAuthToken(result);

        var _authToken = plexPin.getAuthToken(); 

        console.log('AuthToken result: %s', _authToken);

        if(_authToken){
          // Token was authorized
          PinsServer.update(docId, { $set: { authToken: _authToken, authorized: true, expired: false } });
        }
        else{
          // You are not authorized
          PinsServer.update(docId, { $set: { authorized: false } });
        }
      });

      var checkPinErrorCB = Meteor.bindEnvironment(function(error){
        if(error.statusCode === 404){
          PinsServer.update(docId, { $set: { expired: true, authorized: false } });
        }
      });

      plexPin.checkPin(requestId).then(checkPinCB).catch(checkPinErrorCB);
    },
    removeAllPins: function(){
      PinsClient.remove({});
      PinsServer.remove({});
    }
  });
}
