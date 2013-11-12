const St = imports.gi.St;
const Lang = imports.lang;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const ButtonsBar = Me.imports.buttons_bar;

const GPasteButtons = new Lang.Class({
    Name: "GPasteButtons",

    _init: function(gpaste_integration) {
        this._gpaste_integration = gpaste_integration;
        this._statusbar = this._gpaste_integration._statusbar;
        this._client = this._gpaste_integration._client;
        this._client.connect('tracking', Lang.bind(this, function(c, state) {
            this.track_changes_btn.set_checked(state);
        }));

        this._buttons_bar = new ButtonsBar.ButtonsBar();
        this._init_track_changes_button();
        this._init_clear_button();
        this._init_prefs_button();
        this._buttons_bar.add_button(this._track_changes_btn);
        this._buttons_bar.add_button(this._clear_btn);
        this._buttons_bar.add_button(this._prefs_btn);
    },

    _init_track_changes_button: function() {
        let button_params = {
            button_style_class: 'gpaste-toggle-button',
            toggle_mode: true,
            statusbar: this._statusbar
        };

        this._track_changes_btn = new ButtonsBar.ButtonsBarButton(
            Utils.ICONS.toggle,
            '',
            'Track changes',
            button_params,
            Lang.bind(this, function() {
                let checked = this.track_changes_btn.get_checked();
                this._client.track(checked);
            })
        );
    },

    _init_clear_button: function() {
        let button_params = {
            button_style_class: 'gpaste-button',
            statusbar: this._statusbar
        };

        this._clear_btn = new ButtonsBar.ButtonsBarButton(
            Utils.ICONS.clear,
            '',
            'Clear history',
            button_params,
            Lang.bind(this, Lang.bind(this, function() {
                this._gpaste_integration.hide(true);
                this._client.empty();
            }))
        );
    },

    _init_prefs_button: function() {
        let button_params = {
            button_style_class: 'gpaste-button',
            statusbar: this._statusbar
        };
        this._prefs_btn = new ButtonsBar.ButtonsBarButton(
            Utils.ICONS.preferences,
            '',
            'Preferences',
            button_params,
            Lang.bind(this, function() {
                Utils.launch_extension_prefs(Me.uuid);
                this._gpaste_integration.hide(false);
            })
        );
    },

    get actor() {
        return this._buttons_bar.actor;
    },

    get clear_btn() {
        return this._clear_btn;
    },

    get prefs_btn() {
        return this._prefs_btn;
    },

    get track_changes_btn() {
        return this._track_changes_btn;
    }
});
