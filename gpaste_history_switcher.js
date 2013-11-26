const St = imports.gi.St;
const Lang = imports.lang;
const Main = imports.ui.main;
const Shell = imports.gi.Shell;
const Clutter = imports.gi.Clutter;
const Tweener = imports.ui.tweener;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;

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
            x_fill: false,
            x_align: St.Align.START,
            y_expand: false,
            y_fill: false,
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

    _init: function(gpaste_integration) {
        this.actor = new St.BoxLayout({
            style_class: "gpaste-histories-box",
            visible: false,
            reactive: true,
            vertical: true
        });
        this.actor.connect(
            'key-release-event',
            Lang.bind(this, this._on_key_release)
        );
        Main.uiGroup.add_child(this.actor);

        this._gpaste_integration = gpaste_integration;
    },

    _on_key_release: function(o, e) {
        let symbol = e.get_key_symbol()

        if(symbol === Clutter.Escape) {
            this.hide();
            return true;
        }

        return false;
    },

    _reposition: function() {
        let [gpaste_x, gpaste_y] =
            this._gpaste_integration.actor.get_transformed_position();
        this.actor.x =
            gpaste_x + this._gpaste_integration.actor.width - this.actor.width;
        this.actor.y = gpaste_y + this.actor.height;
    },

    _resize: function() {
        this.actor.width = Math.round(
            this._gpaste_integration.actor.width * 0.4
        );
        this.actor.height = Math.round(
            this._gpaste_integration.actor.height * 0.5
        );
    },

    _load_histories: function() {
        this.actor.destroy_all_children();
        let histories = this._gpaste_integration.client.list_histories();

        for(let i = 0; i < histories.length; i++) {
            let history = new GpasteHistorySwitcherItem(histories[i]);
            history.on_clicked = Lang.bind(this, function(history_item) {
                this._gpaste_integration.client.switch_history(
                    history_item.name
                );
                this.hide();
            });
            this.actor.add_child(history.actor);
        }
    },

    show: function() {
        if(this.actor.visible) return;

        this._resize();
        this._reposition();
        this._load_histories();
        Main.pushModal(this.actor, {
            keybindingMode: Shell.KeyBindingMode.NORMAL
        });
        this.actor.opacity = 0;
        this.actor.show();

        Tweener.removeTweens(this.actor);
        Tweener.addTween(this.actor, {
            opacity: 255,
            time: 0.3,
            transition: 'easeOutQuad',
        });
    },

    hide: function() {
        if(!this.actor.visible) return;

        Main.popModal(this.actor);

        Tweener.removeTweens(this.actor);
        Tweener.addTween(this.actor, {
            opacity: 0,
            time: 0.3,
            transition: 'easeOutQuad',
            onComplete: Lang.bind(this, function() {
                this.actor.hide();
                this.actor.opacity = 255;
            })
        });
    },

    toggle: function() {
        if(this.actor.visible) this.hide();
        else this.show();
    },

    destroy: function() {
        this.actor.destroy();
    }
});
