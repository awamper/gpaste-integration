const St = imports.gi.St;
const Lang = imports.lang;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const GPasteClient = Me.imports.gpaste_client;
const PopupDialog = Me.imports.popup_dialog;

const GpasteHistorySwitcherItem = new Lang.Class({
    Name: 'GpasteHistorySwitcherItem',

    _init: function(name) {
        this.name = name;

        this.actor = new St.Table({
            style_class: 'gpaste-histories-item-box',
            homogeneous: false,
            reactive: true,
            track_hover: true
        });

        this._history_button = new St.Button({
            style_class: 'gpaste-histories-item-button',
            label: this.name
        });
        this._history_button.connect(
            'clicked',
            Lang.bind(this, this._on_clicked)
        );

        this.actor.add(this._history_button, {
            row: 0,
            col: 0,
            x_expand: true,
            x_fill: true,
            x_align: St.Align.START,
            y_expand: true,
            y_fill: true,
            y_align: St.Align.MIDDLE
        });

        this.on_clicked = null;
    },

    _on_clicked: function() {
        if(typeof this.on_clicked !== 'function') return;

        this.on_clicked(this);
    },
});

const GpasteHistorySwitcher = new Lang.Class({
    Name: 'GpasteHistorySwitcher',
    Extends: PopupDialog.PopupDialog,

    _init: function(gpaste_integration) {
        this.parent({
            modal: true
        });
        this._box = new St.BoxLayout({
            style_class: 'gpaste-history-switcher-dialog',
            width: 200,
            vertical: true
        });
        this.actor.add_child(this._box);

        this._gpaste_integration = gpaste_integration;
    },

    _load_histories: function() {
        this._box.destroy_all_children();
        GPasteClient.get_client().list_histories(
            Lang.bind(this, function(histories) {
                for(let i = 0; i < histories.length; i++) {
                    let history = new GpasteHistorySwitcherItem(histories[i]);
                    history.on_clicked = Lang.bind(this, function(history_item) {
                        GPasteClient.get_client().switch_history(
                            history_item.name
                        );
                        this.hide();
                    });
                    this._box.add(history.actor, {
                        x_expand: true,
                        x_fill: true
                    });
                }
                this._reposition();
            })
        );
    },

    toggle: function() {
        if(this.actor.visible) this.hide();
        else this.show();
    },

    show: function() {
        this.parent();
        this._load_histories();
    },
});
