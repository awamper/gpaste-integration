// taken from https://github.com/OttoAllmendinger/gnome-shell-imgur/

const Lang = imports.lang;
const Signals = imports.signals;
const Mainloop = imports.mainloop;

const Gio = imports.gi.Gio;
const Soup = imports.gi.Soup;

const ClientId = "7714a4928bff2fd";
const _httpSession = new Soup.SessionAsync();

const Uploader = new Lang.Class({
    Name: 'Uploader',

    _init: function() {
        // nothing
    }
});
Signals.addSignalMethods(Uploader.prototype);

const ImgurUploader = new Lang.Class({
    Name: 'GPasteImgurUploader',
    Extends: Uploader,

    baseUrl: 'https://api.imgur.com/3/',

    _init: function(clientId) {
        this._clientId = clientId || ClientId;
    },

    _getPostMessage: function(filename, mimetype, callback) {
        let url = this.baseUrl + 'image';
        let file = Gio.File.new_for_path(filename);

        file.load_contents_async(null, Lang.bind(this, function(f, res) {
            let contents;

            try {
                [, contents] = f.load_contents_finish(res);
            }
            catch(e) {
                log('error loading file: ' + e.message);
                callback(e, null);
                return;
            }

            let buffer = new Soup.Buffer(contents, contents.length);
            let multipart = new Soup.Multipart(Soup.FORM_MIME_TYPE_MULTIPART);
            multipart.append_form_file('image', filename, mimetype, buffer);

            let message = Soup.form_request_new_from_multipart(url, multipart);

            message.request_headers.append(
                'Authorization', 'Client-ID ' + this._clientId
            );

            callback(null, message);
        }), null);
    },

    upload: function (filename, mimetype) {
        this._getPostMessage(filename, mimetype,
            Lang.bind(this, function(error, message) {
                let total = message.request_body.length;
                let uploaded = 0;

                if(error) {
                    this.emit('error', error);
                    return;
                }

                let signalProgress = message.connect(
                    'wrote-body-data',
                    Lang.bind(this, function(message, buffer) {
                        uploaded += buffer.length;
                        this.emit('progress', uploaded, total);
                    })
                );

                _httpSession.queue_message(message,
                    Lang.bind(this, function(session, {status_code, response_body}) {
                        if(status_code == 200) {
                            this.emit('done', JSON.parse(response_body.data).data);
                        }
                        else {
                            log('getJSON error status code: ' + status_code);
                            log('getJSON error response: ' + response_body.data);

                            let errorMessage;

                            try {
                                errorMessage = JSON.parse(response_body.data).data.error;
                            }
                            catch(e) {
                                log('failed to parse error message ' + e);
                                errorMessage = response_body.data;
                            }

                            this.emit('error', 'HTTP ' + status_code + ' - ' + errorMessage);
                        }

                        message.disconnect(signalProgress);
                    })
                );
            })
        );
    }
});

const DummyUploader = new Lang.Class({
    Name: "DummyUploader",
    Extends: Uploader,

    _init: function () {
        // nothing
    },

    upload: function (filename) {
        let testImage = 'http://i.imgur.com/Vkapy8W.png';
        let size = 200000;
        let chunk = 5000;
        let progress = 0;

        log('DummyUploader.upload() filename=' + filename);

        let update = Lang.bind(this, function() {
            if(progress < size) {
                this.emit("progress", (progress += chunk), size);
                Mainloop.timeout_add(100, update);
            }
            else {
                this.emit("done", {link: testImage});
            }
        });

        Mainloop.idle_add(update);
    }
});
