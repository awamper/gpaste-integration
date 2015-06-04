const Lang = imports.lang;
const Signals = imports.signals;
const Soup = imports.gi.Soup;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;

const HTTP_SESSION = new Soup.SessionAsync();
const BASE_URL = 'https://paste.fedoraproject.org';

const ERROR_CODES = {
    'err_nothing_to_do': 'No POST request was received by the create API',
    'err_author_numeric': 'The paste author\'s alias should be alphanumeric',
    'err_save_error': 'An error occurred while saving the paste',
    'err_spamguard_ipban': 'Poster\'s IP address is banned',
    'err_spamguard_stealth': 'The paste triggered the spam filter',
    'err_spamguard_noflood': 'Poster is trying the flood',
    'err_spamguard_php': 'Poster\'s IP address is listed as malicious'
};

const FpasteUploader = new Lang.Class({
    Name: 'FpasteUploader',

    _init: function() {
        // nothing
    },

    _build_result_url: function(id, hash) {
        return '%s/%s/%s'.format(BASE_URL, id, hash);
    },

    upload: function(text) {
        if(Utils.is_blank(text)) {
            this.emit('error', 'Text is blank.');
        }

        let url = (
            '%s/?paste_private=yes&api_submit=true'.format(BASE_URL) +
            '&mode=json&paste_data=%s'.format(encodeURIComponent(text)) +
            '&paste_lang=text&paste_user=&paste_password'
        );

        let request = Soup.Message.new('GET', url);
        HTTP_SESSION.queue_message(request,
            Lang.bind(this, function(http_session, message) {
                if(message.status_code !== Soup.KnownStatusCode.OK) {
                    let error_message =
                        'FpasteUploader:upload(): Error code: %s'.format(
                            message.status_code
                        );
                    this.emit('error', error_message);
                    return;
                }

                let json;

                try {
                    json = JSON.parse(request.response_body.data);
                }
                catch(e) {
                    let error_message = 'FpasteUploader:get(): %s'.format(e);
                    this.emit('error', error_message);
                    return;
                }

                if(json.result.error) {
                    this.emit('error', ERROR_CODES[json.result.error]);
                }
                else {
                    this.emit('done', this._build_result_url(json.result.id, json.result.hash));
                }
            })
        );
    }
});
Signals.addSignalMethods(FpasteUploader.prototype);
