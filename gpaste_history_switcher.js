const St = imports.gi.St;
const Lang = imports.lang;
const Clutter = imports.gi.Clutter;
const Mainloop = imports.mainloop;
const ExtensionUtils = imports.misc.extensionUtils;
const Tweener = imports.ui.tweener;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const GPasteClient = Me.imports.gpaste_client;
const PopupDialog = Me.imports.popup_dialog;
const PrefsKeys = Me.imports.prefs_keys;

const EFFECT_NAME = 'GPasteHistorySwitcher effects';
const BUTTON_TIMEOUT_MS = 300;
const TIMEOUT_IDS = {
    BUTTON_ENTER: 0,
    BUTTON_LEAVE: 0
};

const GpasteHistorySwitcherItem = new Lang.Class({
    Name: 'GpasteHistorySwitcherItem',

    _init: function(name, reactive) {
        this.name = name;

        this.actor = new St.Table({
            style_class: 'gpaste-histories-item-box',
            homogeneous: false,
            reactive: reactive,
            track_hover: reactive
        });
        if(!reactive) this.actor.add_style_pseudo_class('selected');

        this._history_button = new St.Button({
            style_class: 'gpaste-histories-item-button',
            label: this.name
        });

        if(reactive) {
            this._history_button.connect(
                'clicked',
                Lang.bind(this, this._on_clicked)
            );
        }

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

    get button() {
        return this._history_button;
    }
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

        this._history_items = [];
        this._show_in_center = false;
        this._gpaste_integration = gpaste_integration;
        this._last_history_name = GPasteClient.get_client().history_name;
    },

    _reposition: function() {
        if(this._show_in_center) {
            let [x, y] = this._gpaste_integration.actor.get_transformed_position();
            this.actor.x = Math.round(
                x -
                this.actor.width / 2 +
                this._gpaste_integration.actor.width / 2
            );
            this.actor.y = Math.round(
                y -
                this.actor.height / 2 +
                this._gpaste_integration.actor.height / 2
            );
        }
        else {
            this.parent();
        }
    },

    _load_histories: function() {
        this._box.destroy_all_children();
        this._history_items = [];

        GPasteClient.get_client().list_histories(
            Lang.bind(this, function(histories) {
                histories.sort();

                for(let i = 0; i < histories.length; i++) {
                    let reactive = this._last_history_name === histories[i] ? false : true;
                    let history = new GpasteHistorySwitcherItem(histories[i], reactive);
                    this._history_items.push(history);

                    history.on_clicked = Lang.bind(this, function(history_switcher_item) {
                        this._gpaste_integration.history.switch_history(
                            history_switcher_item.name
                        );
                        this._last_history_name = history_switcher_item.name;
                        this.hide();
                    });

                    history.button.connect('enter-event', Lang.bind(this, function() {
                        if(!reactive) return;

                        if(TIMEOUT_IDS.BUTTON_LEAVE !== 0) {
                            Mainloop.source_remove(TIMEOUT_IDS.BUTTON_LEAVE);
                            TIMEOUT_IDS.BUTTON_LEAVE = 0;
                        }


                        TIMEOUT_IDS.BUTTON_ENTER = Mainloop.timeout_add(BUTTON_TIMEOUT_MS,
                            Lang.bind(this, function() {
                                TIMEOUT_IDS.BUTTON_ENTER = 0;
                                this._gpaste_integration.history.switch_history(history.name);
                            })
                        );
                    }));
                    history.button.connect('leave-event', Lang.bind(this, function() {
                        if(TIMEOUT_IDS.BUTTON_ENTER !== 0) {
                            Mainloop.source_remove(TIMEOUT_IDS.BUTTON_ENTER);
                            TIMEOUT_IDS.BUTTON_ENTER = 0;
                        }

                        TIMEOUT_IDS.BUTTON_LEAVE = Mainloop.timeout_add(BUTTON_TIMEOUT_MS,
                            Lang.bind(this, function() {
                                TIMEOUT_IDS.BUTTON_LEAVE = 0;
                                let current_history = GPasteClient.get_client().history_name;

                                if(current_history !== this._last_history_name) {
                                    this._gpaste_integration.history.switch_history(
                                        this._last_history_name
                                    );
                                }
                            })
                        );
                    }));

                    this._box.add(history.actor, {
                        x_expand: true,
                        x_fill: true
                    });
                }

                this._reposition();
            })
        );
    },

    _get_hovered_history: function() {
        for each(let item in this._history_items) {
            if(item.actor.has_style_pseudo_class('hover')) {
                return item.name;
            }
        }

        return null;
    },

    _hover_first_inactive: function() {
        for each(let item in this._history_items) {
            if(!item.actor.has_style_pseudo_class('selected')) {
                item.actor.add_style_pseudo_class('hover');
                return item.name;
            }
        }

        return null;
    },

    _hover_name: function(name) {
        let result = false;

        for each(let item in this._history_items) {
            if(item.name === name) {
                item.actor.add_style_pseudo_class('hover');
                result = true;
            }
            else {
                item.actor.remove_style_pseudo_class('hover');
            }
        }

        return result;
    },

    toggle: function() {
        if(this.actor.visible) this.hide();
        else this.show();
    },

    next: function() {
        this.disable_modal();
        if(!this.shown) {
            this._show_in_center = true;
            this.show();
        }

        let hovered = this._get_hovered_history();
        if(!hovered) hovered = this._hover_first_inactive();

        GPasteClient.get_client().list_histories(
            Lang.bind(this, function(histories) {
                histories.sort();
                let hovered_index = histories.indexOf(hovered);
                let next_index = hovered_index + 1;
                let history_item = this._history_items[next_index];

                if(history_item) {
                    if(history_item.actor.has_style_pseudo_class('selected')) {
                        next_index += 1;
                    }
                }

                if(next_index === histories.length) next_index = 0;
                let next_history = histories[next_index];
                this._hover_name(next_history);
            })
        );
    },

    prev: function() {
        this.disable_modal();
        if(!this.shown) {
            this._show_in_center = true;
            this.show();
        }

        let hovered = this._get_hovered_history();
        if(!hovered) hovered = this._hover_first_inactive();

        GPasteClient.get_client().list_histories(
            Lang.bind(this, function(histories) {
                histories.sort();
                let hovered_index = histories.indexOf(hovered);
                let prev_index = hovered_index - 1;
                let history_item = this._history_items[prev_index];

                if(history_item) {
                    if(history_item.actor.has_style_pseudo_class('selected')) {
                        prev_index -= 1;
                    }
                }

                if(prev_index < 0) prev_index = histories.length - 1;
                let prev_history = histories[prev_index];
                this._hover_name(prev_history);
            })
        );
    },

    switch_to_hovered: function() {
        let hovered = this._get_hovered_history();
        if(!hovered) return;

        this._gpaste_integration.history.switch_history(hovered);
        this._last_history_name = hovered;
    },

    show: function() {
        let enable_effects = Utils.SETTINGS.get_boolean(PrefsKeys.ENABLE_EFFECTS_KEY);
        let actor = this._gpaste_integration._list_view.actor;
        let tweener_props = {
            time: 2,
            delay: 0.5,
            factor: 1
        };

        if(!this._show_in_center) {
            this.actor.set_pivot_point(1, 1);
            tweener_props.delay = 0;

        }
        else {
            this.actor.set_pivot_point(0.5, 0.5);
            if(!this.shown && enable_effects) {
                for(let i = 0; i < 5; i++) {
                    let blur_effect = new Clutter.BlurEffect();
                    actor.add_effect_with_name(EFFECT_NAME, blur_effect);
                }
            }
        }

        if(enable_effects) {
            let desaturate_effect = new Clutter.DesaturateEffect();
            desaturate_effect.set_factor(0);
            actor.add_effect_with_name(EFFECT_NAME, desaturate_effect);

            Tweener.removeTweens(desaturate_effect);
            Tweener.addTween(desaturate_effect, tweener_props);
        }

        this.parent(Utils.SETTINGS.get_boolean(PrefsKeys.ENABLE_ANIMATIONS_KEY));
        this._load_histories();
    },

    hide: function() {
        for each(let item in this._history_items) {
            if(item.actor.has_style_pseudo_class('hover')) {
                item.actor.remove_style_pseudo_class('hover');
            }
        }

        if(TIMEOUT_IDS.BUTTON_ENTER !== 0) {
            Mainloop.source_remove(TIMEOUT_IDS.BUTTON_ENTER);
            TIMEOUT_IDS.BUTTON_ENTER = 0;
        }
        if(TIMEOUT_IDS.BUTTON_LEAVE !== 0) {
            Mainloop.source_remove(TIMEOUT_IDS.BUTTON_LEAVE);
            TIMEOUT_IDS.BUTTON_LEAVE = 0;
        }

        let actor = this._gpaste_integration._list_view.actor;
        for each(let effect in actor.get_effects()) {
            if(effect.name !== EFFECT_NAME) continue;

            if(effect instanceof Clutter.DesaturateEffect) {
                let desaturate_effect = effect;
                Tweener.removeTweens(desaturate_effect);
                Tweener.addTween(desaturate_effect, {
                    time: 2,
                    factor: 0,
                    onComplete: Lang.bind(this, function() {
                        actor.remove_effect(desaturate_effect);
                    })
                });
            }
            else {
                actor.remove_effect(effect);
            }
        }

        this._show_in_center = false;
        this.parent(Utils.SETTINGS.get_boolean(PrefsKeys.ENABLE_ANIMATIONS_KEY));
    }
});
