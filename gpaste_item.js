const St = imports.gi.St;
const Lang = imports.lang;
const Pango = imports.gi.Pango;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;

const HIGHLIGHT_MARKUP = {
    START: "<span foreground='white' font_weight='heavy' underline='single'>",
    STOP: '</span>'
};
const MAX_DISPLAYED_STRING_LENGTH = 300;

const GPasteItem = new Lang.Class({
    Name: "GPasteItem",

    _init: function(data) {
        this._id = data.id;
        this._text = data.text;
        this._markup = data.markup;

        this._label = new St.Label({
            visible: true
        });
        this._label.clutter_text.set_single_line_mode(true);
        this._label.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
        this._label.clutter_text.set_max_length(MAX_DISPLAYED_STRING_LENGTH);
        this.set_text(this._text);

        this._markup_label = new St.Label({
            visible: false
        });
        this._markup_label.clutter_text.set_single_line_mode(true);
        this._markup_label.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
        this._markup_label.clutter_text.set_max_length(MAX_DISPLAYED_STRING_LENGTH);
        this.set_markup(this._markup);

        this.actor = new St.BoxLayout({
            style_class: "gpaste-item-box",
            reactive: true
        });
        this.actor.add_child(this._label);
        this.actor.add_child(this._markup_label);

        this.show_text();
    },

    _prepare_string: function(str) {
        str = str.replace(/\n/g, ' ');
        str = str.replace(/\s{2,}/g, ' ');
        str = str.trim();

        return str;
    },

    set_text: function(text) {
        if(Utils.is_blank(text)) return;

        this._text = text;

        let displayed_text = this._prepare_string(text);
        this._label.set_text(displayed_text);
    },

    get_text: function() {
        return this._text;
    },

    set_markup: function(markup) {
        if(Utils.is_blank(markup)) return;

        this._markup = markup;

        let displayed_markup;
        let min = 45;
        let start_index = markup.indexOf(HIGHLIGHT_MARKUP.START);

        if(start_index !== -1 && start_index > min) {
            displayed_markup = "..." + markup.slice(start_index - min);
        }
        else {
            displayed_markup = markup;
        }

        this._markup_label.clutter_text.set_markup(
            this._prepare_string(displayed_markup)
        );
    },

    get_markup: function() {
        return this._markup;
    },

    show_text: function() {
        this._markup_label.hide();
        this._label.show();
    },

    show_markup: function() {
        this._label.hide();
        this._markup_label.show();
    },

    hide: function() {
        this.actor.hide();
    },

    show: function() {
        this.actor.show();
    },

    destroy: function() {
        this.actor.destroy();
        this._text = null;
        this._markup = null;
        this._id = null;
    },

    get id() {
        return this._id;
    }
});
