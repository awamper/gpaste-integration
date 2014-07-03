const St = imports.gi.St;
const Lang = imports.lang;
const Clutter = imports.gi.Clutter;
const Signals = imports.signals;
const Shell = imports.gi.Shell;
const Tweener = imports.ui.tweener;
const Params = imports.misc.params;
const Main = imports.ui.main;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;

const CONNECTION_IDS = {
    CAPTURED_EVENT: 0
};

const MIN_SCALE = 0.8;

const PopupDialog = new Lang.Class({
    Name: 'PopupDialog',

    _init: function(params) {
        this.params = Params.parse(params, {
            style_class: '',
            modal: false
        });
        this.actor = new St.BoxLayout({
            style_class: this.params.style_class,
            visible: false
        });
        this.actor.set_pivot_point(0.5, 0.5);

        Main.uiGroup.add_child(this.actor);

        this._shown = false;
    },

    _reposition: function() {
        let [x, y] = global.get_pointer();
        this.actor.x = x - this.actor.width;
        this.actor.y = y - this.actor.height;
    },

    _connect_captured_event: function() {
        CONNECTION_IDS.CAPTURED_EVENT = global.stage.connect(
            'captured-event',
            Lang.bind(this, this._on_captured_event)
        );
    },

    _disconnect_captured_event: function() {
        if(CONNECTION_IDS.CAPTURED_EVENT > 0) {
            global.stage.disconnect(CONNECTION_IDS.CAPTURED_EVENT);
            CONNECTION_IDS.CAPTURED_EVENT = 0;
        }
    },

    _on_captured_event: function(object, event) {
        if(event.type() === Clutter.EventType.BUTTON_RELEASE) {
            let [x, y, mods] = global.get_pointer();
            let pointer_outside = !Utils.is_pointer_inside_actor(this.actor);
            if(pointer_outside) this.hide();
        }
        else if(event.type() === Clutter.EventType.KEY_RELEASE) {
            let symbol = event.get_key_symbol();
            if(symbol === Clutter.Escape) this.hide();
        }
    },

    show: function(animation) {
        if(this.shown) return;

        this._reposition();

        if(this.params.modal) {
            Main.pushModal(this.actor, {
                keybindingMode: Shell.KeyBindingMode.NORMAL
            });
        }

        this.actor.set_opacity(0);
        this.actor.set_scale(MIN_SCALE, MIN_SCALE);
        this.actor.show();

        animation =
            animation === undefined
            ? true
            : animation;

        if(!animation) {
            this.actor.set_opacity(255);
            this.actor.set_scale(1, 1);
            this._connect_captured_event();
            this.shown = true;
            return;
        }

        Tweener.removeTweens(this.actor);
        Tweener.addTween(this.actor, {
            opacity: 255,
            scale_x: 1,
            scale_y: 1,
            time: 0.3,
            transition: 'easeOutQuad',
            onComplete: Lang.bind(this, function() {
                this._connect_captured_event();
                this.shown = true;
            })
        });
    },

    hide: function(animation) {
        if(!this.shown) return;

        if(this.params.modal) Main.popModal(this.actor);
        this._disconnect_captured_event();

        animation =
            animation === undefined
            ? true
            : animation;

        if(!animation) {
            this.actor.hide();
            this.actor.set_scale(1, 1);
            this.actor.set_opacity(255);
            this.shown = false;
            return;
        }

        Tweener.removeTweens(this.actor);
        Tweener.addTween(this.actor, {
            opacity: 0,
            scale_x: MIN_SCALE,
            scale_y: MIN_SCALE,
            time: 0.3,
            transition: 'easeOutQuad',
            onComplete: Lang.bind(this, function() {
                this.actor.hide();
                this.actor.set_scale(1, 1);
                this.actor.set_opacity(255);
                this.shown = false;
            })
        });
    },

    destroy: function() {
        this._disconnect_captured_event();
        this.actor.destroy();
    },

    get shown() {
        return this._shown;
    },

    set shown(shown) {
        this._shown = shown;

        if(this._shown) this.emit('shown');
        else this.emit('hidden');
    }
});
Signals.addSignalMethods(PopupDialog.prototype);
