const Lang = imports.lang;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Signals = imports.signals;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const GPasteClient = Me.imports.gpaste_client;
const Utils = Me.imports.utils;

const GPasteHistoryItem = new Lang.Class({
    Name: 'GPasteHistoryItem',

    _init: function(data, gpaste_history) {
        this.text = data.text;
        this.markup = data.markup;
        this.hash = Utils.fnv32a(data.text);
        this._inactive = false;

        this._gpaste_history = gpaste_history;
    },

    is_file_item: function() {
        return Utils.starts_with(this.text, '[Files]');
    },

    is_image_item: function() {
        return Utils.starts_with(this.text, '[Image');
    },

    get_raw: function(callback) {
        GPasteClient.get_client().get_raw_element(this.index, callback);
    },

    get_info: function(callback) {
        function on_query_complete(object, res, uri) {
            let info;

            try {
                info = object.query_info_finish(res);
            }
            catch(e) {
                log('GpasteHistoryItem.get_info(): %s'.format(e));

                if(e.code === 1) callback('No such file or directory', null);
                else callback(e.message, null);

                return;
            }

            let content_type = info.get_content_type();
            let thumbnail_path = info.get_attribute_byte_string('thumbnail::path');
            let result ='Type: %s'.format(content_type);

            if(content_type !== 'inode/directory') {
                let size = info.get_size();
                result = '%s, '.format(GLib.format_size(size)) + result;
            }

            if(Utils.starts_with(content_type, 'image') || thumbnail_path) {
                if(thumbnail_path) {
                    uri = 'file://%s'.format(thumbnail_path);
                }
            }
            else {
                uri = null;
            }

            callback(result, uri);
        }

        function on_raw_result(raw_item) {
            if(!raw_item) return;

            let uris = raw_item.split('\n');

            if(uris.length > 1) {
                callback('%s items'.format(uris.length), null);
                return;
            }

            let uri = 'file://%s'.format(uris[0]);
            let file = Gio.file_new_for_uri(uri);
            file.query_info_async(
                'standard::content-type,standard::size,thumbnail::path',
                Gio.FileQueryInfoFlags.NONE,
                GLib.PRIORITY_DEFAULT,
                null,
                Lang.bind(this, on_query_complete, uri)
            );
        }

        if(!this.is_file_item() && !this.is_image_item()) {
            let info = '%s symbol(s), %s line(s)'.format(
                this.text.length,
                this.text.split('\n').length
            );
            callback(info, null);
            return;
        }

        this.get_raw(Lang.bind(this, on_raw_result));
    },

    destroy: function() {
        this.emit('destroy');

        delete this.text;
        delete this.markup;
        delete this.hash;
        delete this._inactive;
        delete this._gpaste_history;
    },

    get index() {
        return this._gpaste_history.get_index_for_item(this);
    },

    get inactive() {
        return this._inactive;
    },

    set inactive(inactive) {
        if(this._inactive === inactive || typeof inactive !== 'boolean') return;
        this._inactive = inactive;
        this.emit('inactive-changed');
    }
});
Signals.addSignalMethods(GPasteHistoryItem.prototype);
