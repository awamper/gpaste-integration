const St = imports.gi.St;
const Lang = imports.lang;
const Signals = imports.signals;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const PrefsKeys = Me.imports.prefs_keys;

const CONNECTION_IDS = {
    SETTINGS_CHANGED: 0
};

const PinnedItemsManager = new Lang.Class({
    Name: 'PinnedItemsManager',

    _init: function() {
        this._items = Utils.SETTINGS.get_strv(PrefsKeys.PINNED_ITEMS_KEY);
        CONNECTION_IDS.SETTINGS_CHANGED = Utils.SETTINGS.connect(
            'changed::' + PrefsKeys.PINNED_ITEMS_KEY,
            Lang.bind(this, function() {
                this.emit('changed');
            })
        );
    },

    is_index_exists: function(index) {
        return this._items[index] !== undefined;
    },

    get_index_by_text: function(text) {
        return this._items.indexOf(text);
    },

    add: function(text) {
        if(!text) return false;

        let index = this._items.push(text);
        Utils.SETTINGS.set_strv(PrefsKeys.PINNED_ITEMS_KEY, this._items);
        return index;
    },

    remove: function(index) {
        if(!this.is_index_exists(index)) return false;

        this._items.splice(index, 1);
        Utils.SETTINGS.set_strv(PrefsKeys.PINNED_ITEMS_KEY, this._items);
        return true;
    },

    activate: function(index) {
        if(!this.is_index_exists(index)) return false;

        let clipboard = St.Clipboard.get_default();
        clipboard.set_text(St.ClipboardType.CLIPBOARD, this._items[index]);

        return true;
    },

    list_items: function() {
        return this._items.slice();
    },

    destroy: function() {
        if(CONNECTION_IDS.SETTINGS_CHANGED != 0) {
            Utils.SETTINGS.disconnect(CONNECTION_IDS.SETTINGS_CHANGED);
            CONNECTION_IDS.SETTINGS_CHANGED = 0;
        }

        delete this._items;
        this.emit('destroy');
    },

    get length() {
        return this._items.length;
    }
});
Signals.addSignalMethods(PinnedItemsManager.prototype);

let MANAGER = null;

function get_manager() {
    if(MANAGER === null) {
        MANAGER = new PinnedItemsManager();
        MANAGER.connect('destroy',
            Lang.bind(this, function() {
                MANAGER = null;
            })
        );
    }

    return MANAGER;
}
