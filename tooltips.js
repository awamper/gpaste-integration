const St = imports.gi.St;
const Lang = imports.lang;
const GLib = imports.gi.GLib;
const Mainloop = imports.mainloop;
const Clutter = imports.gi.Clutter;
const Params = imports.misc.params;
const Signals = imports.signals;
const Tweener = imports.ui.tweener;
const Main = imports.ui.main;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const PrefsKeys = Me.imports.prefs_keys;

const Tooltip = new Lang.Class({
    Name: 'Tooltip',

    _init: function(text, params) {
        this.params = Params.parse(params, {
            timeout_hide: 0,
            box_style_class: '',
            label_style_class: ''
        });
        this._text = text;

        this.actor = new St.BoxLayout({
            style_class: this.params.box_style_class,
            opacity: 0
        });

        this.label = new St.Label({
            text: this._text,
            style_class: this.params.label_style_class
        });

        this.actor.add_child(this.label);
    },

    show: function() {
        if(this.actor.opacity === 255) return;

        Tweener.removeTweens(this.actor);
        Tweener.addTween(this.actor, {
            time: 0.5,
            transition: 'easeOutQuad',
            opacity: 255,
            onComplete: Lang.bind(this, function() {
                if(this.params.timeout_hide > 0) {
                    Mainloop.timeout_add(
                        this.params.timeout_hide,
                        Lang.bind(this, this.hide)
                    );
                }
            })
        })
    },

    hide: function(destroy_on_hide) {
        if(this.actor.opacity === 0) return;

        Tweener.removeTweens(this.actor);
        Tweener.addTween(this.actor, {
            time: 0.5,
            transition: 'easeOutQuad',
            opacity: 0,
            onComplete: Lang.bind(this, function() {
                if(destroy_on_hide === true) this.destroy();
            })
        });
    },

    destroy: function() {
        this.actor.destroy();
    }
});

const TooltipsManager = new Lang.Class({
    Name: 'TooltipsManager',

    _init: function() {
        this._default_params = {
            tooltip: Tooltip,
            enter_id: 0,
            leave_id: 0,
            destroy_id: 0,
            text: '',
            tooltip_instance: null,
            timeout: 700,
            timeout_id: 0,
            timeout_hide: 3000,
            box_style_class: 'gpaste-tooltip-box',
            label_style_class: 'gpaste-tooltip-label'
        };
        this._actors = [];
    },

    _adjust_tooltip_position: function(actor) {
        let manager_data = actor._tooltips_manager_data;
        if(manager_data === undefined) return;

        let [x, y] = global.get_pointer();

        let cursor_indent = 10;
        let margin = 20;

        let offset_x = 0;
        let offset_y = 10;

        let monitor = Main.layoutManager.currentMonitor;
        let available_width =
            (monitor.width + monitor.x) - x - cursor_indent - margin;
        let available_height =
            (monitor.height + monitor.y) - y - cursor_indent - margin;

        if(manager_data.tooltip_instance.actor.width > available_width) {
            offset_x = (monitor.width + monitor.x) - (
                manager_data.tooltip_instance.actor.width
                + x
                + margin
            );
        }
        if(manager_data.tooltip_instance.actor.height > available_height) {
            offset_y = (monitor.height + monitor.y) - (
                manager_data.tooltip_instance.actor.height
                + y
                + margin
                + actor.height
            );
        }

        let dialog_x = x + cursor_indent + offset_x;
        let dialog_y = y + cursor_indent + offset_y;

        if(x > dialog_x && y > dialog_y) {
            dialog_x = x - manager_data.tooltip_instance.actor.width - cursor_indent;
        }

        manager_data.tooltip_instance.actor.x = dialog_x;
        manager_data.tooltip_instance.actor.y = dialog_y;
    },

    _add_timeout: function(actor, callback) {
        let manager_data = actor._tooltips_manager_data;
        if(manager_data === undefined) return;

        this._remove_timeout(actor);
        manager_data.timeout_id = Mainloop.timeout_add(
            manager_data.timeout,
            callback
        )
    },

    _remove_timeout: function(actor) {
        let manager_data = actor._tooltips_manager_data;
        if(manager_data === undefined) return;

        if(manager_data.timeout_id > 0) {
            Mainloop.source_remove(manager_data.timeout_id);
            manager_data.timeout_id = 0;
        }
    },

    _on_actor_enter: function(actor) {
        if(!Utils.SETTINGS.get_boolean(PrefsKeys.ENABLE_TOOLTIPS_KEY)) return;
        this._add_timeout(actor, Lang.bind(this, this._show_tooltip, actor));
    },

    _on_actor_leave: function(actor) {
        this._remove_timeout(actor);
        this._hide_tooltip(actor);
    },

    _on_actor_destroy: function(actor) {
        this.remove_tooltip(actor);
    },

    _show_tooltip: function(actor) {
        let manager_data = actor._tooltips_manager_data;
        if(manager_data === undefined) return GLib.SOURCE_REMOVE;

        let manager_data = actor._tooltips_manager_data;

        if(manager_data.tooltip_instance !== null) {
            manager_data.tooltip_instance.destroy();
        }

        manager_data.timeout_id = 0;
        let params = {
            timeout_hide: manager_data.timeout_hide,
            box_style_class: manager_data.box_style_class,
            label_style_class: manager_data.label_style_class
        }
        manager_data.tooltip_instance = new manager_data.tooltip(
            manager_data.text,
            params
        );
        Main.uiGroup.add_child(manager_data.tooltip_instance.actor);
        manager_data.tooltip_instance.actor.raise_top();
        manager_data.tooltip_instance.show();
        this._adjust_tooltip_position(actor);

        return GLib.SOURCE_REMOVE;
    },

    _hide_tooltip: function(actor) {
        let manager_data = actor._tooltips_manager_data;

        if(manager_data !== undefined && manager_data.tooltip_instance !== null) {
            manager_data.tooltip_instance.hide(true);
            manager_data.tooltip_instance = null;
        }
    },

    _connect_actor_signals: function(actor) {
        actor._tooltips_manager_data.enter_id = actor.connect('enter-event',
            Lang.bind(this, this._on_actor_enter)
        );
        actor._tooltips_manager_data.leave_id = actor.connect('leave-event',
            Lang.bind(this, this._on_actor_leave)
        );
        actor._tooltips_manager_data.destroy_id = actor.connect('destroy',
            Lang.bind(this, this._on_actor_destroy)
        );
    },

    _disconnect_actor_signals: function(actor) {
        if(actor._tooltips_manager_data.enter_id > 0) {
            actor.disconnect(actor._tooltips_manager_data.enter_id);
            actor._tooltips_manager_data.enter_id = 0;
        }
        if(actor._tooltips_manager_data.leave_id > 0) {
            actor.disconnect(actor._tooltips_manager_data.leave_id);
            actor._tooltips_manager_data.leave_id = 0;
        }
        if(actor._tooltips_manager_data.destroy_id > 0) {
            actor.disconnect(actor._tooltips_manager_data.destroy_id);
            actor._tooltips_manager_data.destroy_id = 0;
        }
    },

    _disconnect_all_actors: function() {
        for each(let actor in this._actors) {
            this._disconnect_actor_signals(actor);
        }
    },

    add_tooltip: function(actor, params) {
        if(!actor instanceof Clutter.Actor) {
            throw new Error('"actor" must be a Clutter.Actor instance');
        }
        if(actor._tooltips_manager_data !== undefined) {
            throw new Error('actor "%s" already have tooltip'.format(actor));
        }

        params = Params.parse(params, this._default_params);
        actor.reactive = true;
        actor._tooltips_manager_data = params;
        this._actors.push(actor);
        this._connect_actor_signals(actor);
    },

    remove_tooltip: function(actor) {
        if(actor._tooltips_manager_data.tooltip_instance !== null) {
            actor._tooltips_manager_data.tooltip_instance.destroy();
        }

        this._remove_timeout(actor);
        this._disconnect_actor_signals(actor);
        let index = this._actors.indexOf(actor);
        if(index !== -1) this._actors.splice(index, 1);
        delete actor._tooltips_manager_data;
    },

    destroy: function() {
        this._disconnect_all_actors();
        for each(let actor in this._actors) delete actor._tooltips_manager_data;
        delete this._actors;

        this.emit('destroy');
    }
});
Signals.addSignalMethods(TooltipsManager.prototype);

let _TOOLTIPS_MANAGER = null;

function get_manager() {
    if(_TOOLTIPS_MANAGER === null) {
        _TOOLTIPS_MANAGER = new TooltipsManager();
        _TOOLTIPS_MANAGER.connect('destroy',
            Lang.bind(this, function() {
                _TOOLTIPS_MANAGER = null;
            })
        );
    }

    return _TOOLTIPS_MANAGER;
}
