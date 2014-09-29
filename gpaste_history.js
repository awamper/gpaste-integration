const Lang = imports.lang;
const ExtensionUtils = imports.misc.extensionUtils;
const Signals = imports.signals;

const Me = ExtensionUtils.getCurrentExtension();
const GPasteClient = Me.imports.gpaste_client;
const GPasteHistoryItem  = Me.imports.gpaste_history_item;
const Utils = Me.imports.utils;

const CONNECTION_IDS = {
    GPASTE_CHANGED: 0
};

const CHANGE_TYPE = {
    ADDED: 0,
    REMOVED: 1,
    LIFTED: 2,
    CLEARED: 3
};

const GPasteHistory = new Lang.Class({
    Name: 'GPasteHistory',

    _init: function() {
        this._items = [];
        CONNECTION_IDS.GPASTE_CHANGED =
            GPasteClient.get_client().connect(
                'changed',
                Lang.bind(this, this._update_history)
            );

        this._update_history()
    },

    _update_history: function() {
        function on_history_result(history_list) {
            if(!history_list) {
                Main.notify(
                    "GpasteIntegration: Couldn't connect to GPaste daemon"
                );
                this.clear();
                return;
            }
            if(history_list.length < 1) {
                this.clear();
                return;
            }

            let old_length = this._items.length;
            let new_items = [];

            for each(let text in history_list) {
                let history_item = this.get_by_hash(Utils.fnv32a(text));

                if(history_item === null) {
                    history_item = new GPasteHistoryItem.GPasteHistoryItem({
                        text: text,
                        markup: false
                    }, this);
                }
                else {
                    this._items.splice(this._items.indexOf(history_item), 1);
                }

                history_item.inactive = false;
                new_items.push(history_item);
            }

            let type;

            if(old_length === new_items.length) {
                type = CHANGE_TYPE.LIFTED;
            }
            else if(this._items.length > 0) {
                type = CHANGE_TYPE.REMOVED;
            }
            else {
                type = CHANGE_TYPE.ADDED;
            }

            for each(let item in this._items) item.destroy();
            this.set_items(new_items);
            this.emit('changed', type);
        }

        GPasteClient.get_client().get_history(Lang.bind(this, on_history_result));
    },

    _set_history: function(history_list) {
        this.clear();
        let new_items = [];

        for each(let text in history_list) {
            let item_data = {
                text: text,
                markup: false
            };
            let history_item =
                new GPasteHistoryItem.GPasteHistoryItem(item_data, this);
            history_item.inactive = false;
            new_items.push(history_item);
        }

        this.set_items(new_items);
    },

    _destroy_all_items: function() {
        for each(let item in this._items) item.destroy();
    },

    clear: function() {
        this._destroy_all_items();
        this._items = [];
        this.emit('changed', CHANGE_TYPE.CLEARED);
    },

    destroy: function() {
        this.clear();
        GPasteClient.get_client().disconnect(
            CONNECTION_IDS.GPASTE_CHANGED
        );
        this.emit('destroy');
    },

    get_items: function() {
        return this._items;
    },

    set_items: function(history_items) {
        this._items = history_items;
        this._items[0].inactive = true;
    },

    get_index_for_item: function(history_item) {
        let result = -1;

        for(let i = 0; i < this.length; i++) {
            if(history_item.hash === this._items[i].hash) {
                result = i;
                break;
            }
        }

        return result;
    },

    get_by_hash: function(hash) {
        let result = null;

        for each(let history_item in this._items) {
            if(history_item.hash === hash) {
                result = history_item;
                break;
            }
        }

        return result;
    },

    switch_history: function(history_name) {
        GPasteClient.get_client().switch_history(history_name);
        this.emit('history-name-changed');
    },

    get length() {
        return this._items.length;
    },

    set items(history_items) {
        this.set_items(history_items);
    },

    get items() {
        return this.get_items();
    },

    get current_item() {
        return this._current_item;
    }
});
Signals.addSignalMethods(GPasteHistory.prototype);
