const St = imports.gi.St;
const Lang = imports.lang;
const Params = imports.misc.params;
const Tweener = imports.ui.tweener;
const Main = imports.ui.main;
const Shell = imports.gi.Shell;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const PopupDialog = Me.imports.popup_dialog;
const Tooltips = Me.imports.tooltips;

const CONFIRMATION_DIALOG_MIN_SCALE = 0.8;

const ConfirmationDialog = new Lang.Class({
    Name: "ConfirmationDialog",
    Extends: PopupDialog.PopupDialog,

    _init: function(label_text, button) {
        this.parent({
            modal: true
        });
        this.actor.set_pivot_point(1, 1);
        this._table = new St.Table({
            style_class: 'gpaste-confirm-dialog-box',
            homogeneous: false,
            reactive: true
        });

        this._label = new St.Label({
            text: label_text,
            style_class: 'gpaste-confirm-dialog-label'
        });

        this._ok_button = new St.Button({
            label: 'Yes',
            style_class: 'gpaste-confirm-dialog-button'
        });
        this._ok_button.connect("clicked", Lang.bind(this, this.on_confirmed));

        this._cancel_button = new St.Button({
            label: "No",
            style_class: 'gpaste-confirm-dialog-button'
        });
        this._cancel_button.connect("clicked", Lang.bind(this, this.on_cancel));

        this._table.add(this._label, {
            row: 0,
            col: 0,
            x_expand: true,
            y_expand: true,
            x_fill: true,
            y_fill: true,
            x_align: St.Align.MIDDLE,
            y_align: St.Align.MIDDLE
        });
        this._table.add(this._ok_button, {
            row: 1,
            col: 0,
            x_expand: false,
            y_expand: false,
            x_fill: false,
            y_fill: false,
            x_align: St.Align.END
        });
        this._table.add(this._cancel_button, {
            row: 1,
            col: 1,
            x_expand: false,
            y_expand: false,
            x_fill: false,
            y_fill: false,
            x_align: St.Align.END
        });

        this.on_confirm = null;
        this._button = button;

        this.actor.add(this._table);
    },

    on_confirmed: function() {
        this.hide();

        if(typeof(this.on_confirm) === 'function') {
            this.on_confirm();
        }
    },

    on_cancel: function() {
        this.hide();
    }
});

const ButtonsBarButton = new Lang.Class({
    Name: 'ButtonsBarButton',

    _init: function(params) {
        this.params = Params.parse(params, {
            icon_name: '',
            label_text: '',
            tip_text: '',
            button_style_class: 'gpaste-button',
            box_style_class: 'gpaste-button-box',
            track_hover: true,
            reactive: true,
            toggle_mode: false,
            icon_style: 'gpaste-buttons-bar-icon',
            action: false,
            confirmation_dialog: false,
            confirmation_dialog_label: "Are you sure?"
        });
        this._button_box = new St.BoxLayout({
            style_class: this.params.box_style_class
        });
        this._button_content = new St.BoxLayout();

        this._sensitive = true;

        this._button = new St.Button({
            track_hover: this.params.track_hover,
            reactive: this.params.reactive,
            style_class: this.params.button_style_class,
            toggle_mode: this.params.toggle_mode
        });
        this._button.add_actor(this._button_content);
        this._button_box.add_actor(this._button);

        if(typeof(this.params.action) === 'function') {
            this._button.connect(
                'clicked',
                Lang.bind(this, this._on_button_clicked)
            );
        }

        if(this.params.confirmation_dialog) {
            this._confirmation_dialog = new ConfirmationDialog(
                this.params.confirmation_dialog_label,
                this
            );
        }

        this._icon = false;
        this._label = false;
        this._label_text = this.params.label_text;
        this._tip_text = this.params.tip_text;

        if(!Utils.is_blank(this.params.icon_name)) {
            this._icon = new St.Icon({
                icon_name: this.params.icon_name,
                style_class: this.params.icon_style
            });

            this._button_content.add(this._icon, {
                x_fill: false,
                x_align: St.Align.START
            });
        }

        if(!Utils.is_blank(this._label_text)) {
            this._label = new St.Label();
            this._label.clutter_text.set_markup(this._label_text);

            this._button_content.add(this._label, {
                x_fill: false,
                y_align: St.Align.MIDDLE
            });

            if(this._icon) {
                this._label.visible = false;
            }
        }

        if(!Utils.is_blank(this._tip_text)) {
            Tooltips.get_manager().add_tooltip(this._button, {
                text: this._tip_text
            });
        }

        this._button.connect(
            'enter-event',
            Lang.bind(this, this._on_enter_event)
        );
        this._button.connect(
            'leave-event',
            Lang.bind(this, this._on_leave_event)
        );

        if(!this._icon && !this._label) {
            throw new Error('icon and label are both false');
        }
    },

    _on_enter_event: function(object, event) {
        if(this._icon && this._label) {
            this._label.opacity = 0;
            this._label.show();

            Tweener.addTween(this._label, {
                time: 0.3,
                opacity: 255,
                transition: 'easeOutQuad'
            });
        }
    },

    _on_leave_event: function(object, event) {
        if(this._icon && this._label) {
            Tweener.addTween(this._label, {
                time: 0.3,
                opacity: 0,
                transition: 'easeOutQuad',
                onComplete: Lang.bind(this, function() {
                    this._label.hide();
                })
            });
        }
    },

    _on_button_clicked: function() {
        if(!this._sensitive) return;

        if(this._confirmation_dialog !== undefined) {
            this._confirmation_dialog.on_confirm =
                Lang.bind(this, this.params.action);
            this._confirmation_dialog.show();
        }
        else {
            this.params.action();
        }
    },

    connect: function(signal, callback) {
        this.button.connect(signal, callback);
    },

    set_checked: function(checked) {
        if(checked) {
            this.button.add_style_pseudo_class('active');
        }
        else {
            this.button.remove_style_pseudo_class('active');
        }

        this.button.set_checked(checked);
    },

    get_checked: function() {
        return this.button.get_checked();
    },

    set_sensitive: function(sensitive) {
        this._sensitive = sensitive;
    },

    destroy: function() {
        if(this._confirmation_dialog) {
            this._confirmation_dialog.destroy();
        }

        this.params = null;
        this._label_text = null;
        this._tip_text = null;
        this._button_box.destroy();
    },

    get label_actor() {
        return this._label;
    },

    get label() {
        return this._label.clutter_text.get_text();
    },

    set label(text) {
        if(this._label.clutter_text) this._label.clutter_text.set_markup(text);
    },

    get icon_actor() {
        return this._icon;
    },

    get icon_name() {
        return this._icon.icon_name;
    },

    set icon_name(name) {
        this._icon.icon_name;
    },

    get has_icon() {
        return this._icon !== false ? true : false;
    },

    get has_label() {
        return this._label !== false ? true : false;
    },

    get button() {
        return this._button;
    },

    get actor() {
        return this._button_box;
    },
});

const ButtonsBar = new Lang.Class({
    Name: 'ButtonsBar',

    _init: function(params) {
        this.params = Params.parse(params, {
            style_class: 'gpaste-buttons-bar-box'
        });

        this.actor = new St.BoxLayout({
            style_class: this.params.style_class
        });
        this._buttons = [];
    },

    add_button: function(button) {
        this._buttons.push(button);
        this.actor.add(button.actor, {
            x_fill: false,
            x_align: St.Align.START
        });
    },

    clear: function() {
        for(let i = 0; i < this._buttons.length; i++) {
            let button = this._buttons[i];
            button.destroy();
        }
    },

    destroy: function() {
        this.actor.destroy();
    }
});
