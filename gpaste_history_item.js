const Lang = imports.lang;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Signals = imports.signals;
const ExtensionUtils = imports.misc.extensionUtils;
const Util = imports.misc.util;

const Me = ExtensionUtils.getCurrentExtension();
const GPasteClient = Me.imports.gpaste_client;
const Utils = Me.imports.utils;

const FILE_ITEM_REGEXP = new RegExp(/\[Files\] (.+)/i);
const IMAGE_ITEM_REGEXP = new RegExp(/\[Image, (.*\(.*\))\]/i);

const TYPE = {
    TEXT: 0,
    FILE: 1,
    IMAGE: 2,
    LINK: 3
}

const GPasteHistoryItem = new Lang.Class({
    Name: 'GPasteHistoryItem',

    _init: function(data, gpaste_history) {
        this.text = data.text;
        this.markup = data.markup;
        this.hash = Utils.fnv32a(data.text);
        this.hidden = false;
        this.type = TYPE.TEXT;
        this._inactive = false;

        this._set_type();

        this._gpaste_history = gpaste_history;
    },

    _set_type: function() {
        let urls = Util.findUrls(this.text);

        if(FILE_ITEM_REGEXP.test(this.text)) {
            this.type = TYPE.FILE;
        }
        else if(IMAGE_ITEM_REGEXP.test(this.text)) {
            this.type = TYPE.IMAGE;
        }
        else if(urls[0] !== undefined && urls[0].url === this.text) {
            this.type = TYPE.LINK;
        }
        else {
            this.type = TYPE.TEXT;
        }
    },

    is_text_item: function() {
        return this.type === TYPE.TEXT;
    },

    is_file_item: function() {
        return this.type === TYPE.FILE;
    },

    is_image_item: function() {
        return this.type === TYPE.IMAGE;
    },

    is_link_item: function() {
        return this.type === TYPE.LINK;
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

                if(e.code === 1) {
                    callback('No such file or directory', null);
                }
                else {
                    log('GpasteHistoryItem.get_info(): %s'.format(e));
                    callback(e.message, null);
                }

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
        this.text = null;
        this.markup = null;
        this.hash = null;
        this.type = null;
        this._inactive = null;
        this._gpaste_history = null;
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
    },

    get text_without_type() {
        let result;

        if(this.is_file_item()) {
            let matches = FILE_ITEM_REGEXP.exec(this.text);
            result = matches[1];
        }
        else if(this.is_image_item()) {
            let matches = IMAGE_ITEM_REGEXP.exec(this.text);
            result = matches[1];
        }
        else {
            result = this.text;
        }

        return result;
    }
});
Signals.addSignalMethods(GPasteHistoryItem.prototype);
