// mongodatabank.js
//
// Implementation of Databank interface for MongoDB
//
// Copyright 2011, StatusNet Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

var databank = require('./databank'),
    Databank = databank.Databank,
    DatabankError = databank.DatabankError,
    AlreadyExistsError = databank.AlreadyExistsError,
    NoSuchThingError = databank.NoSuchThingError,
    mongodb = require('mongodb'),
    Db = mongodb.Db,
    Connection = mongodb.Connection,
    Server = mongodb.Server;

var MongoDatabank = function(params) {
    this.db = null;
};

MongoDatabank.prototype = new Databank();
MongoDatabank.prototype.constructor = MongoDatabank;

MongoDatabank.prototype.connect = function(params, onCompletion) {

    var host = params.host || 'localhost',
        port = params.port || 27017,
        dbname = params.db || 'test',
        server = new Server(host, port, params);

    if (this.db) {
        if (onCompletion) {
            onCompletion(new AlreadyConnectedError());
        }
        return;
    }

    this.db = new Db(dbname, server);

    this.db.open(function(err, newDb) {
        if (err) {
            if (onCompletion) {
                onCompletion(err);
            }
        } else {
            if (onCompletion) {
                onCompletion(null);
            }
        }
    });
};

// Disconnect yourself.
// onCompletion(err): function to call on completion

MongoDatabank.prototype.disconnect = function(onCompletion) {
    if (!this.db) {
        if (onCompletion) {
            onCompletion(new NotConnectedError());
        }
        return;
    }
    this.db.close(function() {
        this.db     = null;
        this.server = null;
        if (onCompletion) {
            onCompletion(null);
        }
    });
};

// Create a new thing
// type: string, type of thing, usually 'user' or 'activity'
// id: a unique ID, like a nickname or a UUID
// value: JavaScript value; will be JSONified
// onCompletion(err, value): function to call on completion

MongoDatabank.prototype.create = function(type, id, value, onCompletion) {

    if (!this.db) {
        if (onCompletion) {
            onCompletion(new NotConnectedError());
        }
        return;
    }

    var idCol = this.getIdCol(type);

    this.db.collection(type, function(err, coll) {
        if (err) {
            if (onCompletion) {
                onCompletion(err, null);
            }
        }
        coll.insert(value, function(err, newValue) {
            if (err) {
                // FIXME: find unique key errors and convert to AlreadyExistsError
                if (onCompletion) {
                    onCompletion(err, null);
                }
            } else {
                if (onCompletion) {
                    onCompletion(null, newValue);
                }
            }
        });
    });
};

// Read an existing thing
// type: the type of thing; 'user', 'activity'
// id: a unique ID -- nickname or UUID or URI
// onCompletion(err, value): function to call on completion

MongoDatabank.prototype.read = function(type, id, onCompletion) {

    if (!this.db) {
        if (onCompletion) {
            onCompletion(new NotConnectedError());
        }
        return;
    }

    var idCol = this.getIdCol(type);

    this.db.collection(type, function(err, coll) {
        if (err) {
            if (onCompletion) {
                onCompletion(err, null);
            }
        }
        var sel;
        sel[idCol] = id;
        coll.findOne(sel, function(err, value) {
            if (err) {
                // FIXME: find key-miss errors and return a NotExistsError
                if (onCompletion) {
                    onCompletion(err, null);
                }
            } else {
                if (onCompletion) {
                    onCompletion(null, value);
                }
            }
        });
    });
};

// Update an existing thing
// type: the type of thing; 'user', 'activity'
// id: a unique ID -- nickname or UUID or URI
// value: the new value of the thing
// onCompletion(err, value): function to call on completion

MongoDatabank.prototype.update = function(type, id, value, onCompletion) {

    if (!this.db) {
        if (onCompletion) {
            onCompletion(new NotConnectedError());
        }
        return;
    }

    var idCol = this.getIdCol(type);

    this.db.collection(type, function(err, coll) {
        if (err) {
            if (onCompletion) {
                onCompletion(err, null);
            }
        }
        var sel;
        sel[idCol] = id;
        coll.update(sel, value, {}, function(err, newValue) {
            if (err) {
                // FIXME: find key-miss errors and return a NotExistsError
                if (onCompletion) {
                    onCompletion(err, null);
                }
            } else {
                if (onCompletion) {
                    onCompletion(null, newValue);
                }
            }
        });
    });
};

// Delete an existing thing
// type: the type of thing; 'user', 'activity'
// id: a unique ID -- nickname or UUID or URI
// value: the new value of the thing
// onCompletion(err): function to call on completion

MongoDatabank.prototype.del = function(type, id, onCompletion) {

    if (!this.db) {
        if (onCompletion) {
            onCompletion(new NotConnectedError());
        }
        return;
    }

    var idCol = this.getIdCol(type);

    this.db.collection(type, function(err, coll) {
        if (err) {
            if (onCompletion) {
                onCompletion(err, null);
            }
        }
        var sel;
        sel[idCol] = id;
        coll.remove(sel, {}, function(err) {
            if (err) {
                // FIXME: find key-miss errors and return a NotExistsError
                if (onCompletion) {
                    onCompletion(err);
                }
            } else {
                if (onCompletion) {
                    onCompletion(null);
                }
            }
        });
    });
};

// Search for things
// type: type of thing
// criteria: map of criteria, with exact matches, like {'subject.id':'tag:example.org,2011:evan' }
// onResult(value): called once per result found
// onCompletion(err): called once at the end of results

MongoDatabank.prototype.search = function(type, criteria, onResult, onCompletion) {

    if (!this.db) {
        if (onCompletion) {
            onCompletion(new NotConnectedError());
        }
        return;
    }

    this.db.collection(type, function(err, coll) {
        if (err) {
            if (onCompletion) {
                onCompletion(err, null);
            }
        }
        coll.find(criteria, function(err, cursor) {
            if (err) {
                if (onCompletion) {
                    onCompletion(err);
                }
            } else {
                var lastErr = null;

                cursor.each(function(err, value) {
                    if (err) {
                        lastErr = err;
                    } else {
                        if (onResult) {
                            onResult(value);
                        }
                    }
                });

                onCompletion(lastErr);
            }
        });
    });
};

MongoDatabank.prototype.getIdCol = function(type) {
    return (this.schema && this.schema[type]) ? this.schema[type].idCol : '_id';
};

exports.MongoDatabank = MongoDatabank;
