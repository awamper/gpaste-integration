const St = imports.gi.St;
const Lang = imports.lang;
const Pango = imports.gi.Pango;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const ListView = Me.imports.list_view;

const MAX_DISPLAYED_STRING_LENGTH = 300;

const HIGHLIGHT_MARKUP = {
    START: "<span foreground='white' font_weight='heavy' underline='single'>",
    STOP: '</span>'
};

const GPasteListViewRenderer = new Lang.Class({
    Name: 'GPasteListViewRenderer',
    Extends: ListView.RendererBase,

    _init: function(params) {
        this.parent({
            style_class: 'gpaste-item-box'
        });
    },

    _prepare_string: function(str) {
        str = str.replace(/\n/g, ' ');
        str = str.replace(/\s{2,}/g, ' ');
        str = str.trim();

        return str;
    },

    _show_text: function(text) {
        text = this._prepare_string(text);
        this.title_label.set_text(text);
    },

    _show_markup: function(markup) {
        let min = 45;
        let start_index = markup.indexOf(HIGHLIGHT_MARKUP.START);

        if(start_index !== -1 && start_index > min) {
            markup = "..." + markup.slice(start_index - min);
        }

        markup = this._prepare_string(markup);
        this.title_label.clutter_text.set_markup(markup);
    },

    get_display: function(model, index) {
        this.title_label = this.get_title();
        let data = model.get(index);

        if(!Utils.is_blank(data.markup)) {
            this._show_markup(data.markup);
        }
        else {
            this._show_text(data.text);
        }

        this.actor.add(this.title_label, {
            row: 0,
            col: 0,
            x_expand: true,
            x_fill: true,
            x_align: St.Align.START,
            y_expand: false,
            y_fill: false,
            y_align: St.Align.MIDDLE
        });

        return this.actor;
    },

    get_title: function() {
        let title_label = new St.Label();
        title_label.clutter_text.set_single_line_mode(true);
        title_label.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
        title_label.clutter_text.set_max_length(MAX_DISPLAYED_STRING_LENGTH);

        return title_label;
    }
});
