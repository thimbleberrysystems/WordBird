const emojis = [
  {
    emoji: '😀',
    description: 'grinning face',
    category: 'Smileys & Emotion',
    aliases: ['grinning'],
    tags: ['smile', 'happy']
  },
  {
    emoji: '😃',
    description: 'grinning face with big eyes',
    category: 'Smileys & Emotion',
    aliases: ['smiley'],
    tags: ['happy', 'joy', 'haha']
  },
  {
    emoji: '😄',
    description: 'grinning face with smiling eyes',
    category: 'Smileys & Emotion',
    aliases: ['smile'],
    tags: ['happy', 'joy', 'laugh', 'pleased']
  },
  {
    emoji: '😁',
    description: 'beaming face with smiling eyes',
    category: 'Smileys & Emotion',
    aliases: ['grin'],
    tags: []
  },
  {
    emoji: '😆',
    description: 'grinning squinting face',
    category: 'Smileys & Emotion',
    aliases: ['laughing', 'satisfied'],
    tags: ['happy', 'haha']
  },
  {
    emoji: '😅',
    description: 'grinning face with sweat',
    category: 'Smileys & Emotion',
    aliases: ['sweat_smile'],
    tags: ['hot']
  },
  {
    emoji: '🤣',
    description: 'rolling on the floor laughing',
    category: 'Smileys & Emotion',
    aliases: ['rofl'],
    tags: ['lol', 'laughing']
  },
  {
    emoji: '😂',
    description: 'face with tears of joy',
    category: 'Smileys & Emotion',
    aliases: ['joy'],
    tags: ['tears']
  },
  {
    emoji: '🙂',
    description: 'slightly smiling face',
    category: 'Smileys & Emotion',
    aliases: ['slightly_smiling_face'],
    tags: []
  },
  {
    emoji: '🙃',
    description: 'upside-down face',
    category: 'Smileys & Emotion',
    aliases: ['upside_down_face'],
    tags: []
  },
  {
    emoji: '😉',
    description: 'winking face',
    category: 'Smileys & Emotion',
    aliases: ['wink'],
    tags: ['flirt']
  },
  {
    emoji: '😊',
    description: 'smiling face with smiling eyes',
    category: 'Smileys & Emotion',
    aliases: ['blush'],
    tags: ['proud']
  },
  {
    emoji: '😇',
    description: 'smiling face with halo',
    category: 'Smileys & Emotion',
    aliases: ['innocent'],
    tags: ['angel']
  },
  {
    emoji: '🥰',
    description: 'smiling face with hearts',
    category: 'Smileys & Emotion',
    aliases: ['smiling_face_with_three_hearts'],
    tags: ['love']
  },
  {
    emoji: '😍',
    description: 'smiling face with heart-eyes',
    category: 'Smileys & Emotion',
    aliases: ['heart_eyes'],
    tags: ['love', 'crush']
  },
  {
    emoji: '🤩',
    description: 'star-struck',
    category: 'Smileys & Emotion',
    aliases: ['star_struck'],
    tags: ['eyes']
  },
  {
    emoji: '😘',
    description: 'face blowing a kiss',
    category: 'Smileys & Emotion',
    aliases: ['kissing_heart'],
    tags: ['flirt']
  },
  {
    emoji: '😗',
    description: 'kissing face',
    category: 'Smileys & Emotion',
    aliases: ['kissing'],
    tags: []
  },
  {
    emoji: '☺️',
    description: 'smiling face',
    category: 'Smileys & Emotion',
    aliases: ['relaxed'],
    tags: ['blush', 'pleased']
  },
  {
    emoji: '😚',
    description: 'kissing face with closed eyes',
    category: 'Smileys & Emotion',
    aliases: ['kissing_closed_eyes'],
    tags: []
  },
  {
    emoji: '😙',
    description: 'kissing face with smiling eyes',
    category: 'Smileys & Emotion',
    aliases: ['kissing_smiling_eyes'],
    tags: []
  },
  {
    emoji: '🥲',
    description: 'smiling face with tear',
    category: 'Smileys & Emotion',
    aliases: ['smiling_face_with_tear'],
    tags: []
  },
  {
    emoji: '😋',
    description: 'face savoring food',
    category: 'Smileys & Emotion',
    aliases: ['yum'],
    tags: ['tongue', 'lick']
  },
  {
    emoji: '😛',
    description: 'face with tongue',
    category: 'Smileys & Emotion',
    aliases: ['stuck_out_tongue'],
    tags: []
  },
  {
    emoji: '😜',
    description: 'winking face with tongue',
    category: 'Smileys & Emotion',
    aliases: ['stuck_out_tongue_winking_eye'],
    tags: ['prank', 'silly']
  },
  {
    emoji: '🤪',
    description: 'zany face',
    category: 'Smileys & Emotion',
    aliases: ['zany_face'],
    tags: ['goofy', 'wacky']
  },
  {
    emoji: '😝',
    description: 'squinting face with tongue',
    category: 'Smileys & Emotion',
    aliases: ['stuck_out_tongue_closed_eyes'],
    tags: ['prank']
  },
  {
    emoji: '🤑',
    description: 'money-mouth face',
    category: 'Smileys & Emotion',
    aliases: ['money_mouth_face'],
    tags: ['rich']
  },
  {
    emoji: '🤗',
    description: 'hugging face',
    category: 'Smileys & Emotion',
    aliases: ['hugs'],
    tags: []
  },
  {
    emoji: '🤭',
    description: 'face with hand over mouth',
    category: 'Smileys & Emotion',
    aliases: ['hand_over_mouth'],
    tags: ['quiet', 'whoops']
  },
  {
    emoji: '🤫',
    description: 'shushing face',
    category: 'Smileys & Emotion',
    aliases: ['shushing_face'],
    tags: ['silence', 'quiet']
  },
  {
    emoji: '🤔',
    description: 'thinking face',
    category: 'Smileys & Emotion',
    aliases: ['thinking'],
    tags: []
  },
  {
    emoji: '🤐',
    description: 'zipper-mouth face',
    category: 'Smileys & Emotion',
    aliases: ['zipper_mouth_face'],
    tags: ['silence', 'hush']
  },
  {
    emoji: '🤨',
    description: 'face with raised eyebrow',
    category: 'Smileys & Emotion',
    aliases: ['raised_eyebrow'],
    tags: ['suspicious']
  },
  {
    emoji: '😐',
    description: 'neutral face',
    category: 'Smileys & Emotion',
    aliases: ['neutral_face'],
    tags: ['meh']
  },
  {
    emoji: '😑',
    description: 'expressionless face',
    category: 'Smileys & Emotion',
    aliases: ['expressionless'],
    tags: []
  },
  {
    emoji: '😶',
    description: 'face without mouth',
    category: 'Smileys & Emotion',
    aliases: ['no_mouth'],
    tags: ['mute', 'silence']
  },
  {
    emoji: '😶‍🌫️',
    description: 'face in clouds',
    category: 'Smileys & Emotion',
    aliases: ['face_in_clouds'],
    tags: []
  },
  {
    emoji: '😏',
    description: 'smirking face',
    category: 'Smileys & Emotion',
    aliases: ['smirk'],
    tags: ['smug']
  },
  {
    emoji: '😒',
    description: 'unamused face',
    category: 'Smileys & Emotion',
    aliases: ['unamused'],
    tags: ['meh']
  },
  {
    emoji: '🙄',
    description: 'face with rolling eyes',
    category: 'Smileys & Emotion',
    aliases: ['roll_eyes'],
    tags: []
  },
  {
    emoji: '😬',
    description: 'grimacing face',
    category: 'Smileys & Emotion',
    aliases: ['grimacing'],
    tags: []
  },
  {
    emoji: '😮‍💨',
    description: 'face exhaling',
    category: 'Smileys & Emotion',
    aliases: ['face_exhaling'],
    tags: []
  },
  {
    emoji: '🤥',
    description: 'lying face',
    category: 'Smileys & Emotion',
    aliases: ['lying_face'],
    tags: ['liar']
  },
  {
    emoji: '😌',
    description: 'relieved face',
    category: 'Smileys & Emotion',
    aliases: ['relieved'],
    tags: ['whew']
  },
  {
    emoji: '😔',
    description: 'pensive face',
    category: 'Smileys & Emotion',
    aliases: ['pensive'],
    tags: []
  },
  {
    emoji: '😪',
    description: 'sleepy face',
    category: 'Smileys & Emotion',
    aliases: ['sleepy'],
    tags: ['tired']
  },
  {
    emoji: '🤤',
    description: 'drooling face',
    category: 'Smileys & Emotion',
    aliases: ['drooling_face'],
    tags: []
  },
  {
    emoji: '😴',
    description: 'sleeping face',
    category: 'Smileys & Emotion',
    aliases: ['sleeping'],
    tags: ['zzz']
  },
  {
    emoji: '😷',
    description: 'face with medical mask',
    category: 'Smileys & Emotion',
    aliases: ['mask'],
    tags: ['sick', 'ill']
  },
  {
    emoji: '🤒',
    description: 'face with thermometer',
    category: 'Smileys & Emotion',
    aliases: ['face_with_thermometer'],
    tags: ['sick']
  },
  {
    emoji: '🤕',
    description: 'face with head-bandage',
    category: 'Smileys & Emotion',
    aliases: ['face_with_head_bandage'],
    tags: ['hurt']
  },
  {
    emoji: '🤢',
    description: 'nauseated face',
    category: 'Smileys & Emotion',
    aliases: ['nauseated_face'],
    tags: ['sick', 'barf', 'disgusted']
  },
  {
    emoji: '🤮',
    description: 'face vomiting',
    category: 'Smileys & Emotion',
    aliases: ['vomiting_face'],
    tags: ['barf', 'sick']
  },
  {
    emoji: '🤧',
    description: 'sneezing face',
    category: 'Smileys & Emotion',
    aliases: ['sneezing_face'],
    tags: ['achoo', 'sick']
  },
  {
    emoji: '🥵',
    description: 'hot face',
    category: 'Smileys & Emotion',
    aliases: ['hot_face'],
    tags: ['heat', 'sweating']
  },
  {
    emoji: '🥶',
    description: 'cold face',
    category: 'Smileys & Emotion',
    aliases: ['cold_face'],
    tags: ['freezing', 'ice']
  },
  {
    emoji: '🥴',
    description: 'woozy face',
    category: 'Smileys & Emotion',
    aliases: ['woozy_face'],
    tags: ['groggy']
  },
  {
    emoji: '😵',
    description: 'knocked-out face',
    category: 'Smileys & Emotion',
    aliases: ['dizzy_face'],
    tags: []
  },
  {
    emoji: '😵‍💫',
    description: 'face with spiral eyes',
    category: 'Smileys & Emotion',
    aliases: ['face_with_spiral_eyes'],
    tags: []
  },
  {
    emoji: '🤯',
    description: 'exploding head',
    category: 'Smileys & Emotion',
    aliases: ['exploding_head'],
    tags: ['mind', 'blown']
  },
  {
    emoji: '🤠',
    description: 'cowboy hat face',
    category: 'Smileys & Emotion',
    aliases: ['cowboy_hat_face'],
    tags: []
  },
  {
    emoji: '🥳',
    description: 'partying face',
    category: 'Smileys & Emotion',
    aliases: ['partying_face'],
    tags: ['celebration', 'birthday']
  },
  {
    emoji: '🥸',
    description: 'disguised face',
    category: 'Smileys & Emotion',
    aliases: ['disguised_face'],
    tags: []
  },
  {
    emoji: '😎',
    description: 'smiling face with sunglasses',
    category: 'Smileys & Emotion',
    aliases: ['sunglasses'],
    tags: ['cool']
  },
  {
    emoji: '🤓',
    description: 'nerd face',
    category: 'Smileys & Emotion',
    aliases: ['nerd_face'],
    tags: ['geek', 'glasses']
  },
  {
    emoji: '🧐',
    description: 'face with monocle',
    category: 'Smileys & Emotion',
    aliases: ['monocle_face'],
    tags: []
  },
  {
    emoji: '😕',
    description: 'confused face',
    category: 'Smileys & Emotion',
    aliases: ['confused'],
    tags: []
  },
  {
    emoji: '😟',
    description: 'worried face',
    category: 'Smileys & Emotion',
    aliases: ['worried'],
    tags: ['nervous']
  },
  {
    emoji: '🙁',
    description: 'slightly frowning face',
    category: 'Smileys & Emotion',
    aliases: ['slightly_frowning_face'],
    tags: []
  },
  {
    emoji: '☹️',
    description: 'frowning face',
    category: 'Smileys & Emotion',
    aliases: ['frowning_face'],
    tags: []
  },
  {
    emoji: '😮',
    description: 'face with open mouth',
    category: 'Smileys & Emotion',
    aliases: ['open_mouth'],
    tags: ['surprise', 'impressed', 'wow']
  },
  {
    emoji: '😯',
    description: 'hushed face',
    category: 'Smileys & Emotion',
    aliases: ['hushed'],
    tags: ['silence', 'speechless']
  },
  {
    emoji: '😲',
    description: 'astonished face',
    category: 'Smileys & Emotion',
    aliases: ['astonished'],
    tags: ['amazed', 'gasp']
  },
  {
    emoji: '😳',
    description: 'flushed face',
    category: 'Smileys & Emotion',
    aliases: ['flushed'],
    tags: []
  },
  {
    emoji: '🥺',
    description: 'pleading face',
    category: 'Smileys & Emotion',
    aliases: ['pleading_face'],
    tags: ['puppy', 'eyes']
  },
  {
    emoji: '😦',
    description: 'frowning face with open mouth',
    category: 'Smileys & Emotion',
    aliases: ['frowning'],
    tags: []
  },
  {
    emoji: '😧',
    description: 'anguished face',
    category: 'Smileys & Emotion',
    aliases: ['anguished'],
    tags: ['stunned']
  },
  {
    emoji: '😨',
    description: 'fearful face',
    category: 'Smileys & Emotion',
    aliases: ['fearful'],
    tags: ['scared', 'shocked', 'oops']
  },
  {
    emoji: '😰',
    description: 'anxious face with sweat',
    category: 'Smileys & Emotion',
    aliases: ['cold_sweat'],
    tags: ['nervous']
  },
  {
    emoji: '😥',
    description: 'sad but relieved face',
    category: 'Smileys & Emotion',
    aliases: ['disappointed_relieved'],
    tags: ['phew', 'sweat', 'nervous']
  },
  {
    emoji: '😢',
    description: 'crying face',
    category: 'Smileys & Emotion',
    aliases: ['cry'],
    tags: ['sad', 'tear']
  },
  {
    emoji: '😭',
    description: 'loudly crying face',
    category: 'Smileys & Emotion',
    aliases: ['sob'],
    tags: ['sad', 'cry', 'bawling']
  },
  {
    emoji: '😱',
    description: 'face screaming in fear',
    category: 'Smileys & Emotion',
    aliases: ['scream'],
    tags: ['horror', 'shocked']
  },
  {
    emoji: '😖',
    description: 'confounded face',
    category: 'Smileys & Emotion',
    aliases: ['confounded'],
    tags: []
  },
  {
    emoji: '😣',
    description: 'persevering face',
    category: 'Smileys & Emotion',
    aliases: ['persevere'],
    tags: ['struggling']
  },
  {
    emoji: '😞',
    description: 'disappointed face',
    category: 'Smileys & Emotion',
    aliases: ['disappointed'],
    tags: ['sad']
  },
  {
    emoji: '😓',
    description: 'downcast face with sweat',
    category: 'Smileys & Emotion',
    aliases: ['sweat'],
    tags: []
  },
  {
    emoji: '😩',
    description: 'weary face',
    category: 'Smileys & Emotion',
    aliases: ['weary'],
    tags: ['tired']
  },
  {
    emoji: '😫',
    description: 'tired face',
    category: 'Smileys & Emotion',
    aliases: ['tired_face'],
    tags: ['upset', 'whine']
  },
  {
    emoji: '🥱',
    description: 'yawning face',
    category: 'Smileys & Emotion',
    aliases: ['yawning_face'],
    tags: []
  },
  {
    emoji: '😤',
    description: 'face with steam from nose',
    category: 'Smileys & Emotion',
    aliases: ['triumph'],
    tags: ['smug']
  },
  {
    emoji: '😡',
    description: 'pouting face',
    category: 'Smileys & Emotion',
    aliases: ['rage', 'pout'],
    tags: ['angry']
  },
  {
    emoji: '😠',
    description: 'angry face',
    category: 'Smileys & Emotion',
    aliases: ['angry'],
    tags: ['mad', 'annoyed']
  },
  {
    emoji: '🤬',
    description: 'face with symbols on mouth',
    category: 'Smileys & Emotion',
    aliases: ['cursing_face'],
    tags: ['foul']
  },
  {
    emoji: '😈',
    description: 'smiling face with horns',
    category: 'Smileys & Emotion',
    aliases: ['smiling_imp'],
    tags: ['devil', 'evil', 'horns']
  },
  {
    emoji: '👿',
    description: 'angry face with horns',
    category: 'Smileys & Emotion',
    aliases: ['imp'],
    tags: ['angry', 'devil', 'evil', 'horns']
  },
  {
    emoji: '💀',
    description: 'skull',
    category: 'Smileys & Emotion',
    aliases: ['skull'],
    tags: ['dead', 'danger', 'poison']
  },
  {
    emoji: '☠️',
    description: 'skull and crossbones',
    category: 'Smileys & Emotion',
    aliases: ['skull_and_crossbones'],
    tags: ['danger', 'pirate']
  },
  {
    emoji: '💩',
    description: 'pile of poo',
    category: 'Smileys & Emotion',
    aliases: ['hankey', 'poop', 'shit'],
    tags: ['crap']
  },
  {
    emoji: '🤡',
    description: 'clown face',
    category: 'Smileys & Emotion',
    aliases: ['clown_face'],
    tags: []
  },
  {
    emoji: '👹',
    description: 'ogre',
    category: 'Smileys & Emotion',
    aliases: ['japanese_ogre'],
    tags: ['monster']
  },
  {
    emoji: '👺',
    description: 'goblin',
    category: 'Smileys & Emotion',
    aliases: ['japanese_goblin'],
    tags: []
  },
  {
    emoji: '👻',
    description: 'ghost',
    category: 'Smileys & Emotion',
    aliases: ['ghost'],
    tags: ['halloween']
  },
  {
    emoji: '👽',
    description: 'alien',
    category: 'Smileys & Emotion',
    aliases: ['alien'],
    tags: ['ufo']
  },
  {
    emoji: '👾',
    description: 'alien monster',
    category: 'Smileys & Emotion',
    aliases: ['space_invader'],
    tags: ['game', 'retro']
  },
  {
    emoji: '🤖',
    description: 'robot',
    category: 'Smileys & Emotion',
    aliases: ['robot'],
    tags: []
  },
  {
    emoji: '😺',
    description: 'grinning cat',
    category: 'Smileys & Emotion',
    aliases: ['smiley_cat'],
    tags: []
  },
  {
    emoji: '😸',
    description: 'grinning cat with smiling eyes',
    category: 'Smileys & Emotion',
    aliases: ['smile_cat'],
    tags: []
  },
  {
    emoji: '😹',
    description: 'cat with tears of joy',
    category: 'Smileys & Emotion',
    aliases: ['joy_cat'],
    tags: []
  },
  {
    emoji: '😻',
    description: 'smiling cat with heart-eyes',
    category: 'Smileys & Emotion',
    aliases: ['heart_eyes_cat'],
    tags: []
  },
  {
    emoji: '😼',
    description: 'cat with wry smile',
    category: 'Smileys & Emotion',
    aliases: ['smirk_cat'],
    tags: []
  },
  {
    emoji: '😽',
    description: 'kissing cat',
    category: 'Smileys & Emotion',
    aliases: ['kissing_cat'],
    tags: []
  },
  {
    emoji: '🙀',
    description: 'weary cat',
    category: 'Smileys & Emotion',
    aliases: ['scream_cat'],
    tags: ['horror']
  },
  {
    emoji: '😿',
    description: 'crying cat',
    category: 'Smileys & Emotion',
    aliases: ['crying_cat_face'],
    tags: ['sad', 'tear']
  },
  {
    emoji: '😾',
    description: 'pouting cat',
    category: 'Smileys & Emotion',
    aliases: ['pouting_cat'],
    tags: []
  },
  {
    emoji: '🙈',
    description: 'see-no-evil monkey',
    category: 'Smileys & Emotion',
    aliases: ['see_no_evil'],
    tags: ['monkey', 'blind', 'ignore']
  },
  {
    emoji: '🙉',
    description: 'hear-no-evil monkey',
    category: 'Smileys & Emotion',
    aliases: ['hear_no_evil'],
    tags: ['monkey', 'deaf']
  },
  {
    emoji: '🙊',
    description: 'speak-no-evil monkey',
    category: 'Smileys & Emotion',
    aliases: ['speak_no_evil'],
    tags: ['monkey', 'mute', 'hush']
  },
  {
    emoji: '💋',
    description: 'kiss mark',
    category: 'Smileys & Emotion',
    aliases: ['kiss'],
    tags: ['lipstick']
  },
  {
    emoji: '💌',
    description: 'love letter',
    category: 'Smileys & Emotion',
    aliases: ['love_letter'],
    tags: ['email', 'envelope']
  },
  {
    emoji: '💘',
    description: 'heart with arrow',
    category: 'Smileys & Emotion',
    aliases: ['cupid'],
    tags: ['love', 'heart']
  },
  {
    emoji: '💝',
    description: 'heart with ribbon',
    category: 'Smileys & Emotion',
    aliases: ['gift_heart'],
    tags: ['chocolates']
  },
  {
    emoji: '💖',
    description: 'sparkling heart',
    category: 'Smileys & Emotion',
    aliases: ['sparkling_heart'],
    tags: []
  },
  {
    emoji: '💗',
    description: 'growing heart',
    category: 'Smileys & Emotion',
    aliases: ['heartpulse'],
    tags: []
  },
  {
    emoji: '💓',
    description: 'beating heart',
    category: 'Smileys & Emotion',
    aliases: ['heartbeat'],
    tags: []
  },
  {
    emoji: '💞',
    description: 'revolving hearts',
    category: 'Smileys & Emotion',
    aliases: ['revolving_hearts'],
    tags: []
  },
  {
    emoji: '💕',
    description: 'two hearts',
    category: 'Smileys & Emotion',
    aliases: ['two_hearts'],
    tags: []
  },
  {
    emoji: '💟',
    description: 'heart decoration',
    category: 'Smileys & Emotion',
    aliases: ['heart_decoration'],
    tags: []
  },
  {
    emoji: '❣️',
    description: 'heart exclamation',
    category: 'Smileys & Emotion',
    aliases: ['heavy_heart_exclamation'],
    tags: []
  },
  {
    emoji: '💔',
    description: 'broken heart',
    category: 'Smileys & Emotion',
    aliases: ['broken_heart'],
    tags: []
  },
  {
    emoji: '❤️‍🔥',
    description: 'heart on fire',
    category: 'Smileys & Emotion',
    aliases: ['heart_on_fire'],
    tags: []
  },
  {
    emoji: '❤️‍🩹',
    description: 'mending heart',
    category: 'Smileys & Emotion',
    aliases: ['mending_heart'],
    tags: []
  },
  {
    emoji: '❤️',
    description: 'red heart',
    category: 'Smileys & Emotion',
    aliases: ['heart'],
    tags: ['love']
  },
  {
    emoji: '🧡',
    description: 'orange heart',
    category: 'Smileys & Emotion',
    aliases: ['orange_heart'],
    tags: []
  },
  {
    emoji: '💛',
    description: 'yellow heart',
    category: 'Smileys & Emotion',
    aliases: ['yellow_heart'],
    tags: []
  },
  {
    emoji: '💚',
    description: 'green heart',
    category: 'Smileys & Emotion',
    aliases: ['green_heart'],
    tags: []
  },
  {
    emoji: '💙',
    description: 'blue heart',
    category: 'Smileys & Emotion',
    aliases: ['blue_heart'],
    tags: []
  },
  {
    emoji: '💜',
    description: 'purple heart',
    category: 'Smileys & Emotion',
    aliases: ['purple_heart'],
    tags: []
  },
  {
    emoji: '🤎',
    description: 'brown heart',
    category: 'Smileys & Emotion',
    aliases: ['brown_heart'],
    tags: []
  },
  {
    emoji: '🖤',
    description: 'black heart',
    category: 'Smileys & Emotion',
    aliases: ['black_heart'],
    tags: []
  },
  {
    emoji: '🤍',
    description: 'white heart',
    category: 'Smileys & Emotion',
    aliases: ['white_heart'],
    tags: []
  },
  {
    emoji: '💯',
    description: 'hundred points',
    category: 'Smileys & Emotion',
    aliases: ['100'],
    tags: ['score', 'perfect']
  },
  {
    emoji: '💢',
    description: 'anger symbol',
    category: 'Smileys & Emotion',
    aliases: ['anger'],
    tags: ['angry']
  },
  {
    emoji: '💥',
    description: 'collision',
    category: 'Smileys & Emotion',
    aliases: ['boom', 'collision'],
    tags: ['explode']
  },
  {
    emoji: '💫',
    description: 'dizzy',
    category: 'Smileys & Emotion',
    aliases: ['dizzy'],
    tags: ['star']
  },
  {
    emoji: '💦',
    description: 'sweat droplets',
    category: 'Smileys & Emotion',
    aliases: ['sweat_drops'],
    tags: ['water', 'workout']
  },
  {
    emoji: '💨',
    description: 'dashing away',
    category: 'Smileys & Emotion',
    aliases: ['dash'],
    tags: ['wind', 'blow', 'fast']
  },
  {
    emoji: '🕳️',
    description: 'hole',
    category: 'Smileys & Emotion',
    aliases: ['hole'],
    tags: []
  },
  {
    emoji: '💣',
    description: 'bomb',
    category: 'Smileys & Emotion',
    aliases: ['bomb'],
    tags: ['boom']
  },
  {
    emoji: '💬',
    description: 'speech balloon',
    category: 'Smileys & Emotion',
    aliases: ['speech_balloon'],
    tags: ['comment']
  },
  {
    emoji: '👁️‍🗨️',
    description: 'eye in speech bubble',
    category: 'Smileys & Emotion',
    aliases: ['eye_speech_bubble'],
    tags: []
  },
  {
    emoji: '🗨️',
    description: 'left speech bubble',
    category: 'Smileys & Emotion',
    aliases: ['left_speech_bubble'],
    tags: []
  },
  {
    emoji: '🗯️',
    description: 'right anger bubble',
    category: 'Smileys & Emotion',
    aliases: ['right_anger_bubble'],
    tags: []
  },
  {
    emoji: '💭',
    description: 'thought balloon',
    category: 'Smileys & Emotion',
    aliases: ['thought_balloon'],
    tags: ['thinking']
  },
  {
    emoji: '💤',
    description: 'zzz',
    category: 'Smileys & Emotion',
    aliases: ['zzz'],
    tags: ['sleeping']
  },
  {
    emoji: '👋',
    description: 'waving hand',
    category: 'People & Body',
    aliases: ['wave'],
    tags: ['goodbye'],
    skin_tones: true
  },
  {
    emoji: '🤚',
    description: 'raised back of hand',
    category: 'People & Body',
    aliases: ['raised_back_of_hand'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🖐️',
    description: 'hand with fingers splayed',
    category: 'People & Body',
    aliases: ['raised_hand_with_fingers_splayed'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '✋',
    description: 'raised hand',
    category: 'People & Body',
    aliases: ['hand', 'raised_hand'],
    tags: ['highfive', 'stop'],
    skin_tones: true
  },
  {
    emoji: '🖖',
    description: 'vulcan salute',
    category: 'People & Body',
    aliases: ['vulcan_salute'],
    tags: ['prosper', 'spock'],
    skin_tones: true
  },
  {
    emoji: '👌',
    description: 'OK hand',
    category: 'People & Body',
    aliases: ['ok_hand'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🤌',
    description: 'pinched fingers',
    category: 'People & Body',
    aliases: ['pinched_fingers'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🤏',
    description: 'pinching hand',
    category: 'People & Body',
    aliases: ['pinching_hand'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '✌️',
    description: 'victory hand',
    category: 'People & Body',
    aliases: ['v'],
    tags: ['victory', 'peace'],
    skin_tones: true
  },
  {
    emoji: '🤞',
    description: 'crossed fingers',
    category: 'People & Body',
    aliases: ['crossed_fingers'],
    tags: ['luck', 'hopeful'],
    skin_tones: true
  },
  {
    emoji: '🤟',
    description: 'love-you gesture',
    category: 'People & Body',
    aliases: ['love_you_gesture'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🤘',
    description: 'sign of the horns',
    category: 'People & Body',
    aliases: ['metal'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🤙',
    description: 'call me hand',
    category: 'People & Body',
    aliases: ['call_me_hand'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👈',
    description: 'backhand index pointing left',
    category: 'People & Body',
    aliases: ['point_left'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👉',
    description: 'backhand index pointing right',
    category: 'People & Body',
    aliases: ['point_right'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👆',
    description: 'backhand index pointing up',
    category: 'People & Body',
    aliases: ['point_up_2'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🖕',
    description: 'middle finger',
    category: 'People & Body',
    aliases: ['middle_finger', 'fu'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👇',
    description: 'backhand index pointing down',
    category: 'People & Body',
    aliases: ['point_down'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '☝️',
    description: 'index pointing up',
    category: 'People & Body',
    aliases: ['point_up'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👍',
    description: 'thumbs up',
    category: 'People & Body',
    aliases: ['+1', 'thumbsup'],
    tags: ['approve', 'ok'],
    skin_tones: true
  },
  {
    emoji: '👎',
    description: 'thumbs down',
    category: 'People & Body',
    aliases: ['-1', 'thumbsdown'],
    tags: ['disapprove', 'bury'],
    skin_tones: true
  },
  {
    emoji: '✊',
    description: 'raised fist',
    category: 'People & Body',
    aliases: ['fist_raised', 'fist'],
    tags: ['power'],
    skin_tones: true
  },
  {
    emoji: '👊',
    description: 'oncoming fist',
    category: 'People & Body',
    aliases: ['fist_oncoming', 'facepunch', 'punch'],
    tags: ['attack'],
    skin_tones: true
  },
  {
    emoji: '🤛',
    description: 'left-facing fist',
    category: 'People & Body',
    aliases: ['fist_left'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🤜',
    description: 'right-facing fist',
    category: 'People & Body',
    aliases: ['fist_right'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👏',
    description: 'clapping hands',
    category: 'People & Body',
    aliases: ['clap'],
    tags: ['praise', 'applause'],
    skin_tones: true
  },
  {
    emoji: '🙌',
    description: 'raising hands',
    category: 'People & Body',
    aliases: ['raised_hands'],
    tags: ['hooray'],
    skin_tones: true
  },
  {
    emoji: '👐',
    description: 'open hands',
    category: 'People & Body',
    aliases: ['open_hands'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🤲',
    description: 'palms up together',
    category: 'People & Body',
    aliases: ['palms_up_together'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🤝',
    description: 'handshake',
    category: 'People & Body',
    aliases: ['handshake'],
    tags: ['deal']
  },
  {
    emoji: '🙏',
    description: 'folded hands',
    category: 'People & Body',
    aliases: ['pray'],
    tags: ['please', 'hope', 'wish'],
    skin_tones: true
  },
  {
    emoji: '✍️',
    description: 'writing hand',
    category: 'People & Body',
    aliases: ['writing_hand'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '💅',
    description: 'nail polish',
    category: 'People & Body',
    aliases: ['nail_care'],
    tags: ['beauty', 'manicure'],
    skin_tones: true
  },
  {
    emoji: '🤳',
    description: 'selfie',
    category: 'People & Body',
    aliases: ['selfie'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '💪',
    description: 'flexed biceps',
    category: 'People & Body',
    aliases: ['muscle'],
    tags: ['flex', 'bicep', 'strong', 'workout'],
    skin_tones: true
  },
  {
    emoji: '🦾',
    description: 'mechanical arm',
    category: 'People & Body',
    aliases: ['mechanical_arm'],
    tags: []
  },
  {
    emoji: '🦿',
    description: 'mechanical leg',
    category: 'People & Body',
    aliases: ['mechanical_leg'],
    tags: []
  },
  {
    emoji: '🦵',
    description: 'leg',
    category: 'People & Body',
    aliases: ['leg'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🦶',
    description: 'foot',
    category: 'People & Body',
    aliases: ['foot'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👂',
    description: 'ear',
    category: 'People & Body',
    aliases: ['ear'],
    tags: ['hear', 'sound', 'listen'],
    skin_tones: true
  },
  {
    emoji: '🦻',
    description: 'ear with hearing aid',
    category: 'People & Body',
    aliases: ['ear_with_hearing_aid'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👃',
    description: 'nose',
    category: 'People & Body',
    aliases: ['nose'],
    tags: ['smell'],
    skin_tones: true
  },
  {
    emoji: '🧠',
    description: 'brain',
    category: 'People & Body',
    aliases: ['brain'],
    tags: []
  },
  {
    emoji: '🫀',
    description: 'anatomical heart',
    category: 'People & Body',
    aliases: ['anatomical_heart'],
    tags: []
  },
  {
    emoji: '🫁',
    description: 'lungs',
    category: 'People & Body',
    aliases: ['lungs'],
    tags: []
  },
  {
    emoji: '🦷',
    description: 'tooth',
    category: 'People & Body',
    aliases: ['tooth'],
    tags: []
  },
  {
    emoji: '🦴',
    description: 'bone',
    category: 'People & Body',
    aliases: ['bone'],
    tags: []
  },
  {
    emoji: '👀',
    description: 'eyes',
    category: 'People & Body',
    aliases: ['eyes'],
    tags: ['look', 'see', 'watch']
  },
  {
    emoji: '👁️',
    description: 'eye',
    category: 'People & Body',
    aliases: ['eye'],
    tags: []
  },
  {
    emoji: '👅',
    description: 'tongue',
    category: 'People & Body',
    aliases: ['tongue'],
    tags: ['taste']
  },
  {
    emoji: '👄',
    description: 'mouth',
    category: 'People & Body',
    aliases: ['lips'],
    tags: ['kiss']
  },
  {
    emoji: '👶',
    description: 'baby',
    category: 'People & Body',
    aliases: ['baby'],
    tags: ['child', 'newborn'],
    skin_tones: true
  },
  {
    emoji: '🧒',
    description: 'child',
    category: 'People & Body',
    aliases: ['child'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👦',
    description: 'boy',
    category: 'People & Body',
    aliases: ['boy'],
    tags: ['child'],
    skin_tones: true
  },
  {
    emoji: '👧',
    description: 'girl',
    category: 'People & Body',
    aliases: ['girl'],
    tags: ['child'],
    skin_tones: true
  },
  {
    emoji: '🧑',
    description: 'person',
    category: 'People & Body',
    aliases: ['adult'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👱',
    description: 'person: blond hair',
    category: 'People & Body',
    aliases: ['blond_haired_person'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👨',
    description: 'man',
    category: 'People & Body',
    aliases: ['man'],
    tags: ['mustache', 'father', 'dad'],
    skin_tones: true
  },
  {
    emoji: '🧔',
    description: 'person: beard',
    category: 'People & Body',
    aliases: ['bearded_person'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🧔‍♂️',
    description: 'man: beard',
    category: 'People & Body',
    aliases: ['man_beard'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🧔‍♀️',
    description: 'woman: beard',
    category: 'People & Body',
    aliases: ['woman_beard'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👨‍🦰',
    description: 'man: red hair',
    category: 'People & Body',
    aliases: ['red_haired_man'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👨‍🦱',
    description: 'man: curly hair',
    category: 'People & Body',
    aliases: ['curly_haired_man'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👨‍🦳',
    description: 'man: white hair',
    category: 'People & Body',
    aliases: ['white_haired_man'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👨‍🦲',
    description: 'man: bald',
    category: 'People & Body',
    aliases: ['bald_man'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👩',
    description: 'woman',
    category: 'People & Body',
    aliases: ['woman'],
    tags: ['girls'],
    skin_tones: true
  },
  {
    emoji: '👩‍🦰',
    description: 'woman: red hair',
    category: 'People & Body',
    aliases: ['red_haired_woman'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🧑‍🦰',
    description: 'person: red hair',
    category: 'People & Body',
    aliases: ['person_red_hair'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👩‍🦱',
    description: 'woman: curly hair',
    category: 'People & Body',
    aliases: ['curly_haired_woman'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🧑‍🦱',
    description: 'person: curly hair',
    category: 'People & Body',
    aliases: ['person_curly_hair'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👩‍🦳',
    description: 'woman: white hair',
    category: 'People & Body',
    aliases: ['white_haired_woman'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🧑‍🦳',
    description: 'person: white hair',
    category: 'People & Body',
    aliases: ['person_white_hair'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👩‍🦲',
    description: 'woman: bald',
    category: 'People & Body',
    aliases: ['bald_woman'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🧑‍🦲',
    description: 'person: bald',
    category: 'People & Body',
    aliases: ['person_bald'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👱‍♀️',
    description: 'woman: blond hair',
    category: 'People & Body',
    aliases: ['blond_haired_woman', 'blonde_woman'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👱‍♂️',
    description: 'man: blond hair',
    category: 'People & Body',
    aliases: ['blond_haired_man'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🧓',
    description: 'older person',
    category: 'People & Body',
    aliases: ['older_adult'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👴',
    description: 'old man',
    category: 'People & Body',
    aliases: ['older_man'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👵',
    description: 'old woman',
    category: 'People & Body',
    aliases: ['older_woman'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🙍',
    description: 'person frowning',
    category: 'People & Body',
    aliases: ['frowning_person'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🙍‍♂️',
    description: 'man frowning',
    category: 'People & Body',
    aliases: ['frowning_man'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🙍‍♀️',
    description: 'woman frowning',
    category: 'People & Body',
    aliases: ['frowning_woman'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🙎',
    description: 'person pouting',
    category: 'People & Body',
    aliases: ['pouting_face'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🙎‍♂️',
    description: 'man pouting',
    category: 'People & Body',
    aliases: ['pouting_man'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🙎‍♀️',
    description: 'woman pouting',
    category: 'People & Body',
    aliases: ['pouting_woman'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🙅',
    description: 'person gesturing NO',
    category: 'People & Body',
    aliases: ['no_good'],
    tags: ['stop', 'halt', 'denied'],
    skin_tones: true
  },
  {
    emoji: '🙅‍♂️',
    description: 'man gesturing NO',
    category: 'People & Body',
    aliases: ['no_good_man', 'ng_man'],
    tags: ['stop', 'halt', 'denied'],
    skin_tones: true
  },
  {
    emoji: '🙅‍♀️',
    description: 'woman gesturing NO',
    category: 'People & Body',
    aliases: ['no_good_woman', 'ng_woman'],
    tags: ['stop', 'halt', 'denied'],
    skin_tones: true
  },
  {
    emoji: '🙆',
    description: 'person gesturing OK',
    category: 'People & Body',
    aliases: ['ok_person'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🙆‍♂️',
    description: 'man gesturing OK',
    category: 'People & Body',
    aliases: ['ok_man'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🙆‍♀️',
    description: 'woman gesturing OK',
    category: 'People & Body',
    aliases: ['ok_woman'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '💁',
    description: 'person tipping hand',
    category: 'People & Body',
    aliases: ['tipping_hand_person', 'information_desk_person'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '💁‍♂️',
    description: 'man tipping hand',
    category: 'People & Body',
    aliases: ['tipping_hand_man', 'sassy_man'],
    tags: ['information'],
    skin_tones: true
  },
  {
    emoji: '💁‍♀️',
    description: 'woman tipping hand',
    category: 'People & Body',
    aliases: ['tipping_hand_woman', 'sassy_woman'],
    tags: ['information'],
    skin_tones: true
  },
  {
    emoji: '🙋',
    description: 'person raising hand',
    category: 'People & Body',
    aliases: ['raising_hand'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🙋‍♂️',
    description: 'man raising hand',
    category: 'People & Body',
    aliases: ['raising_hand_man'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🙋‍♀️',
    description: 'woman raising hand',
    category: 'People & Body',
    aliases: ['raising_hand_woman'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🧏',
    description: 'deaf person',
    category: 'People & Body',
    aliases: ['deaf_person'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🧏‍♂️',
    description: 'deaf man',
    category: 'People & Body',
    aliases: ['deaf_man'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🧏‍♀️',
    description: 'deaf woman',
    category: 'People & Body',
    aliases: ['deaf_woman'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🙇',
    description: 'person bowing',
    category: 'People & Body',
    aliases: ['bow'],
    tags: ['respect', 'thanks'],
    skin_tones: true
  },
  {
    emoji: '🙇‍♂️',
    description: 'man bowing',
    category: 'People & Body',
    aliases: ['bowing_man'],
    tags: ['respect', 'thanks'],
    skin_tones: true
  },
  {
    emoji: '🙇‍♀️',
    description: 'woman bowing',
    category: 'People & Body',
    aliases: ['bowing_woman'],
    tags: ['respect', 'thanks'],
    skin_tones: true
  },
  {
    emoji: '🤦',
    description: 'person facepalming',
    category: 'People & Body',
    aliases: ['facepalm'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🤦‍♂️',
    description: 'man facepalming',
    category: 'People & Body',
    aliases: ['man_facepalming'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🤦‍♀️',
    description: 'woman facepalming',
    category: 'People & Body',
    aliases: ['woman_facepalming'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🤷',
    description: 'person shrugging',
    category: 'People & Body',
    aliases: ['shrug'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🤷‍♂️',
    description: 'man shrugging',
    category: 'People & Body',
    aliases: ['man_shrugging'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🤷‍♀️',
    description: 'woman shrugging',
    category: 'People & Body',
    aliases: ['woman_shrugging'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🧑‍⚕️',
    description: 'health worker',
    category: 'People & Body',
    aliases: ['health_worker'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👨‍⚕️',
    description: 'man health worker',
    category: 'People & Body',
    aliases: ['man_health_worker'],
    tags: ['doctor', 'nurse'],
    skin_tones: true
  },
  {
    emoji: '👩‍⚕️',
    description: 'woman health worker',
    category: 'People & Body',
    aliases: ['woman_health_worker'],
    tags: ['doctor', 'nurse'],
    skin_tones: true
  },
  {
    emoji: '🧑‍🎓',
    description: 'student',
    category: 'People & Body',
    aliases: ['student'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👨‍🎓',
    description: 'man student',
    category: 'People & Body',
    aliases: ['man_student'],
    tags: ['graduation'],
    skin_tones: true
  },
  {
    emoji: '👩‍🎓',
    description: 'woman student',
    category: 'People & Body',
    aliases: ['woman_student'],
    tags: ['graduation'],
    skin_tones: true
  },
  {
    emoji: '🧑‍🏫',
    description: 'teacher',
    category: 'People & Body',
    aliases: ['teacher'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👨‍🏫',
    description: 'man teacher',
    category: 'People & Body',
    aliases: ['man_teacher'],
    tags: ['school', 'professor'],
    skin_tones: true
  },
  {
    emoji: '👩‍🏫',
    description: 'woman teacher',
    category: 'People & Body',
    aliases: ['woman_teacher'],
    tags: ['school', 'professor'],
    skin_tones: true
  },
  {
    emoji: '🧑‍⚖️',
    description: 'judge',
    category: 'People & Body',
    aliases: ['judge'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👨‍⚖️',
    description: 'man judge',
    category: 'People & Body',
    aliases: ['man_judge'],
    tags: ['justice'],
    skin_tones: true
  },
  {
    emoji: '👩‍⚖️',
    description: 'woman judge',
    category: 'People & Body',
    aliases: ['woman_judge'],
    tags: ['justice'],
    skin_tones: true
  },
  {
    emoji: '🧑‍🌾',
    description: 'farmer',
    category: 'People & Body',
    aliases: ['farmer'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👨‍🌾',
    description: 'man farmer',
    category: 'People & Body',
    aliases: ['man_farmer'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👩‍🌾',
    description: 'woman farmer',
    category: 'People & Body',
    aliases: ['woman_farmer'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🧑‍🍳',
    description: 'cook',
    category: 'People & Body',
    aliases: ['cook'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👨‍🍳',
    description: 'man cook',
    category: 'People & Body',
    aliases: ['man_cook'],
    tags: ['chef'],
    skin_tones: true
  },
  {
    emoji: '👩‍🍳',
    description: 'woman cook',
    category: 'People & Body',
    aliases: ['woman_cook'],
    tags: ['chef'],
    skin_tones: true
  },
  {
    emoji: '🧑‍🔧',
    description: 'mechanic',
    category: 'People & Body',
    aliases: ['mechanic'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👨‍🔧',
    description: 'man mechanic',
    category: 'People & Body',
    aliases: ['man_mechanic'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👩‍🔧',
    description: 'woman mechanic',
    category: 'People & Body',
    aliases: ['woman_mechanic'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🧑‍🏭',
    description: 'factory worker',
    category: 'People & Body',
    aliases: ['factory_worker'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👨‍🏭',
    description: 'man factory worker',
    category: 'People & Body',
    aliases: ['man_factory_worker'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👩‍🏭',
    description: 'woman factory worker',
    category: 'People & Body',
    aliases: ['woman_factory_worker'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🧑‍💼',
    description: 'office worker',
    category: 'People & Body',
    aliases: ['office_worker'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👨‍💼',
    description: 'man office worker',
    category: 'People & Body',
    aliases: ['man_office_worker'],
    tags: ['business'],
    skin_tones: true
  },
  {
    emoji: '👩‍💼',
    description: 'woman office worker',
    category: 'People & Body',
    aliases: ['woman_office_worker'],
    tags: ['business'],
    skin_tones: true
  },
  {
    emoji: '🧑‍🔬',
    description: 'scientist',
    category: 'People & Body',
    aliases: ['scientist'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👨‍🔬',
    description: 'man scientist',
    category: 'People & Body',
    aliases: ['man_scientist'],
    tags: ['research'],
    skin_tones: true
  },
  {
    emoji: '👩‍🔬',
    description: 'woman scientist',
    category: 'People & Body',
    aliases: ['woman_scientist'],
    tags: ['research'],
    skin_tones: true
  },
  {
    emoji: '🧑‍💻',
    description: 'technologist',
    category: 'People & Body',
    aliases: ['technologist'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👨‍💻',
    description: 'man technologist',
    category: 'People & Body',
    aliases: ['man_technologist'],
    tags: ['coder'],
    skin_tones: true
  },
  {
    emoji: '👩‍💻',
    description: 'woman technologist',
    category: 'People & Body',
    aliases: ['woman_technologist'],
    tags: ['coder'],
    skin_tones: true
  },
  {
    emoji: '🧑‍🎤',
    description: 'singer',
    category: 'People & Body',
    aliases: ['singer'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👨‍🎤',
    description: 'man singer',
    category: 'People & Body',
    aliases: ['man_singer'],
    tags: ['rockstar'],
    skin_tones: true
  },
  {
    emoji: '👩‍🎤',
    description: 'woman singer',
    category: 'People & Body',
    aliases: ['woman_singer'],
    tags: ['rockstar'],
    skin_tones: true
  },
  {
    emoji: '🧑‍🎨',
    description: 'artist',
    category: 'People & Body',
    aliases: ['artist'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👨‍🎨',
    description: 'man artist',
    category: 'People & Body',
    aliases: ['man_artist'],
    tags: ['painter'],
    skin_tones: true
  },
  {
    emoji: '👩‍🎨',
    description: 'woman artist',
    category: 'People & Body',
    aliases: ['woman_artist'],
    tags: ['painter'],
    skin_tones: true
  },
  {
    emoji: '🧑‍✈️',
    description: 'pilot',
    category: 'People & Body',
    aliases: ['pilot'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👨‍✈️',
    description: 'man pilot',
    category: 'People & Body',
    aliases: ['man_pilot'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👩‍✈️',
    description: 'woman pilot',
    category: 'People & Body',
    aliases: ['woman_pilot'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🧑‍🚀',
    description: 'astronaut',
    category: 'People & Body',
    aliases: ['astronaut'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👨‍🚀',
    description: 'man astronaut',
    category: 'People & Body',
    aliases: ['man_astronaut'],
    tags: ['space'],
    skin_tones: true
  },
  {
    emoji: '👩‍🚀',
    description: 'woman astronaut',
    category: 'People & Body',
    aliases: ['woman_astronaut'],
    tags: ['space'],
    skin_tones: true
  },
  {
    emoji: '🧑‍🚒',
    description: 'firefighter',
    category: 'People & Body',
    aliases: ['firefighter'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👨‍🚒',
    description: 'man firefighter',
    category: 'People & Body',
    aliases: ['man_firefighter'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👩‍🚒',
    description: 'woman firefighter',
    category: 'People & Body',
    aliases: ['woman_firefighter'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👮',
    description: 'police officer',
    category: 'People & Body',
    aliases: ['police_officer', 'cop'],
    tags: ['law'],
    skin_tones: true
  },
  {
    emoji: '👮‍♂️',
    description: 'man police officer',
    category: 'People & Body',
    aliases: ['policeman'],
    tags: ['law', 'cop'],
    skin_tones: true
  },
  {
    emoji: '👮‍♀️',
    description: 'woman police officer',
    category: 'People & Body',
    aliases: ['policewoman'],
    tags: ['law', 'cop'],
    skin_tones: true
  },
  {
    emoji: '🕵️',
    description: 'detective',
    category: 'People & Body',
    aliases: ['detective'],
    tags: ['sleuth'],
    skin_tones: true
  },
  {
    emoji: '🕵️‍♂️',
    description: 'man detective',
    category: 'People & Body',
    aliases: ['male_detective'],
    tags: ['sleuth'],
    skin_tones: true
  },
  {
    emoji: '🕵️‍♀️',
    description: 'woman detective',
    category: 'People & Body',
    aliases: ['female_detective'],
    tags: ['sleuth'],
    skin_tones: true
  },
  {
    emoji: '💂',
    description: 'guard',
    category: 'People & Body',
    aliases: ['guard'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '💂‍♂️',
    description: 'man guard',
    category: 'People & Body',
    aliases: ['guardsman'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '💂‍♀️',
    description: 'woman guard',
    category: 'People & Body',
    aliases: ['guardswoman'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🥷',
    description: 'ninja',
    category: 'People & Body',
    aliases: ['ninja'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👷',
    description: 'construction worker',
    category: 'People & Body',
    aliases: ['construction_worker'],
    tags: ['helmet'],
    skin_tones: true
  },
  {
    emoji: '👷‍♂️',
    description: 'man construction worker',
    category: 'People & Body',
    aliases: ['construction_worker_man'],
    tags: ['helmet'],
    skin_tones: true
  },
  {
    emoji: '👷‍♀️',
    description: 'woman construction worker',
    category: 'People & Body',
    aliases: ['construction_worker_woman'],
    tags: ['helmet'],
    skin_tones: true
  },
  {
    emoji: '🤴',
    description: 'prince',
    category: 'People & Body',
    aliases: ['prince'],
    tags: ['crown', 'royal'],
    skin_tones: true
  },
  {
    emoji: '👸',
    description: 'princess',
    category: 'People & Body',
    aliases: ['princess'],
    tags: ['crown', 'royal'],
    skin_tones: true
  },
  {
    emoji: '👳',
    description: 'person wearing turban',
    category: 'People & Body',
    aliases: ['person_with_turban'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👳‍♂️',
    description: 'man wearing turban',
    category: 'People & Body',
    aliases: ['man_with_turban'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👳‍♀️',
    description: 'woman wearing turban',
    category: 'People & Body',
    aliases: ['woman_with_turban'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👲',
    description: 'person with skullcap',
    category: 'People & Body',
    aliases: ['man_with_gua_pi_mao'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🧕',
    description: 'woman with headscarf',
    category: 'People & Body',
    aliases: ['woman_with_headscarf'],
    tags: ['hijab'],
    skin_tones: true
  },
  {
    emoji: '🤵',
    description: 'person in tuxedo',
    category: 'People & Body',
    aliases: ['person_in_tuxedo'],
    tags: ['groom', 'marriage', 'wedding'],
    skin_tones: true
  },
  {
    emoji: '🤵‍♂️',
    description: 'man in tuxedo',
    category: 'People & Body',
    aliases: ['man_in_tuxedo'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🤵‍♀️',
    description: 'woman in tuxedo',
    category: 'People & Body',
    aliases: ['woman_in_tuxedo'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👰',
    description: 'person with veil',
    category: 'People & Body',
    aliases: ['person_with_veil'],
    tags: ['marriage', 'wedding'],
    skin_tones: true
  },
  {
    emoji: '👰‍♂️',
    description: 'man with veil',
    category: 'People & Body',
    aliases: ['man_with_veil'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👰‍♀️',
    description: 'woman with veil',
    category: 'People & Body',
    aliases: ['woman_with_veil', 'bride_with_veil'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🤰',
    description: 'pregnant woman',
    category: 'People & Body',
    aliases: ['pregnant_woman'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🤱',
    description: 'breast-feeding',
    category: 'People & Body',
    aliases: ['breast_feeding'],
    tags: ['nursing'],
    skin_tones: true
  },
  {
    emoji: '👩‍🍼',
    description: 'woman feeding baby',
    category: 'People & Body',
    aliases: ['woman_feeding_baby'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👨‍🍼',
    description: 'man feeding baby',
    category: 'People & Body',
    aliases: ['man_feeding_baby'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🧑‍🍼',
    description: 'person feeding baby',
    category: 'People & Body',
    aliases: ['person_feeding_baby'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👼',
    description: 'baby angel',
    category: 'People & Body',
    aliases: ['angel'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🎅',
    description: 'Santa Claus',
    category: 'People & Body',
    aliases: ['santa'],
    tags: ['christmas'],
    skin_tones: true
  },
  {
    emoji: '🤶',
    description: 'Mrs. Claus',
    category: 'People & Body',
    aliases: ['mrs_claus'],
    tags: ['santa'],
    skin_tones: true
  },
  {
    emoji: '🧑‍🎄',
    description: 'mx claus',
    category: 'People & Body',
    aliases: ['mx_claus'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🦸',
    description: 'superhero',
    category: 'People & Body',
    aliases: ['superhero'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🦸‍♂️',
    description: 'man superhero',
    category: 'People & Body',
    aliases: ['superhero_man'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🦸‍♀️',
    description: 'woman superhero',
    category: 'People & Body',
    aliases: ['superhero_woman'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🦹',
    description: 'supervillain',
    category: 'People & Body',
    aliases: ['supervillain'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🦹‍♂️',
    description: 'man supervillain',
    category: 'People & Body',
    aliases: ['supervillain_man'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🦹‍♀️',
    description: 'woman supervillain',
    category: 'People & Body',
    aliases: ['supervillain_woman'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🧙',
    description: 'mage',
    category: 'People & Body',
    aliases: ['mage'],
    tags: ['wizard'],
    skin_tones: true
  },
  {
    emoji: '🧙‍♂️',
    description: 'man mage',
    category: 'People & Body',
    aliases: ['mage_man'],
    tags: ['wizard'],
    skin_tones: true
  },
  {
    emoji: '🧙‍♀️',
    description: 'woman mage',
    category: 'People & Body',
    aliases: ['mage_woman'],
    tags: ['wizard'],
    skin_tones: true
  },
  {
    emoji: '🧚',
    description: 'fairy',
    category: 'People & Body',
    aliases: ['fairy'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🧚‍♂️',
    description: 'man fairy',
    category: 'People & Body',
    aliases: ['fairy_man'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🧚‍♀️',
    description: 'woman fairy',
    category: 'People & Body',
    aliases: ['fairy_woman'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🧛',
    description: 'vampire',
    category: 'People & Body',
    aliases: ['vampire'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🧛‍♂️',
    description: 'man vampire',
    category: 'People & Body',
    aliases: ['vampire_man'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🧛‍♀️',
    description: 'woman vampire',
    category: 'People & Body',
    aliases: ['vampire_woman'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🧜',
    description: 'merperson',
    category: 'People & Body',
    aliases: ['merperson'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🧜‍♂️',
    description: 'merman',
    category: 'People & Body',
    aliases: ['merman'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🧜‍♀️',
    description: 'mermaid',
    category: 'People & Body',
    aliases: ['mermaid'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🧝',
    description: 'elf',
    category: 'People & Body',
    aliases: ['elf'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🧝‍♂️',
    description: 'man elf',
    category: 'People & Body',
    aliases: ['elf_man'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🧝‍♀️',
    description: 'woman elf',
    category: 'People & Body',
    aliases: ['elf_woman'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🧞',
    description: 'genie',
    category: 'People & Body',
    aliases: ['genie'],
    tags: []
  },
  {
    emoji: '🧞‍♂️',
    description: 'man genie',
    category: 'People & Body',
    aliases: ['genie_man'],
    tags: []
  },
  {
    emoji: '🧞‍♀️',
    description: 'woman genie',
    category: 'People & Body',
    aliases: ['genie_woman'],
    tags: []
  },
  {
    emoji: '🧟',
    description: 'zombie',
    category: 'People & Body',
    aliases: ['zombie'],
    tags: []
  },
  {
    emoji: '🧟‍♂️',
    description: 'man zombie',
    category: 'People & Body',
    aliases: ['zombie_man'],
    tags: []
  },
  {
    emoji: '🧟‍♀️',
    description: 'woman zombie',
    category: 'People & Body',
    aliases: ['zombie_woman'],
    tags: []
  },
  {
    emoji: '💆',
    description: 'person getting massage',
    category: 'People & Body',
    aliases: ['massage'],
    tags: ['spa'],
    skin_tones: true
  },
  {
    emoji: '💆‍♂️',
    description: 'man getting massage',
    category: 'People & Body',
    aliases: ['massage_man'],
    tags: ['spa'],
    skin_tones: true
  },
  {
    emoji: '💆‍♀️',
    description: 'woman getting massage',
    category: 'People & Body',
    aliases: ['massage_woman'],
    tags: ['spa'],
    skin_tones: true
  },
  {
    emoji: '💇',
    description: 'person getting haircut',
    category: 'People & Body',
    aliases: ['haircut'],
    tags: ['beauty'],
    skin_tones: true
  },
  {
    emoji: '💇‍♂️',
    description: 'man getting haircut',
    category: 'People & Body',
    aliases: ['haircut_man'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '💇‍♀️',
    description: 'woman getting haircut',
    category: 'People & Body',
    aliases: ['haircut_woman'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🚶',
    description: 'person walking',
    category: 'People & Body',
    aliases: ['walking'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🚶‍♂️',
    description: 'man walking',
    category: 'People & Body',
    aliases: ['walking_man'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🚶‍♀️',
    description: 'woman walking',
    category: 'People & Body',
    aliases: ['walking_woman'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🧍',
    description: 'person standing',
    category: 'People & Body',
    aliases: ['standing_person'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🧍‍♂️',
    description: 'man standing',
    category: 'People & Body',
    aliases: ['standing_man'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🧍‍♀️',
    description: 'woman standing',
    category: 'People & Body',
    aliases: ['standing_woman'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🧎',
    description: 'person kneeling',
    category: 'People & Body',
    aliases: ['kneeling_person'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🧎‍♂️',
    description: 'man kneeling',
    category: 'People & Body',
    aliases: ['kneeling_man'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🧎‍♀️',
    description: 'woman kneeling',
    category: 'People & Body',
    aliases: ['kneeling_woman'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🧑‍🦯',
    description: 'person with white cane',
    category: 'People & Body',
    aliases: ['person_with_probing_cane'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👨‍🦯',
    description: 'man with white cane',
    category: 'People & Body',
    aliases: ['man_with_probing_cane'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👩‍🦯',
    description: 'woman with white cane',
    category: 'People & Body',
    aliases: ['woman_with_probing_cane'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🧑‍🦼',
    description: 'person in motorized wheelchair',
    category: 'People & Body',
    aliases: ['person_in_motorized_wheelchair'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👨‍🦼',
    description: 'man in motorized wheelchair',
    category: 'People & Body',
    aliases: ['man_in_motorized_wheelchair'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👩‍🦼',
    description: 'woman in motorized wheelchair',
    category: 'People & Body',
    aliases: ['woman_in_motorized_wheelchair'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🧑‍🦽',
    description: 'person in manual wheelchair',
    category: 'People & Body',
    aliases: ['person_in_manual_wheelchair'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👨‍🦽',
    description: 'man in manual wheelchair',
    category: 'People & Body',
    aliases: ['man_in_manual_wheelchair'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👩‍🦽',
    description: 'woman in manual wheelchair',
    category: 'People & Body',
    aliases: ['woman_in_manual_wheelchair'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🏃',
    description: 'person running',
    category: 'People & Body',
    aliases: ['runner', 'running'],
    tags: ['exercise', 'workout', 'marathon'],
    skin_tones: true
  },
  {
    emoji: '🏃‍♂️',
    description: 'man running',
    category: 'People & Body',
    aliases: ['running_man'],
    tags: ['exercise', 'workout', 'marathon'],
    skin_tones: true
  },
  {
    emoji: '🏃‍♀️',
    description: 'woman running',
    category: 'People & Body',
    aliases: ['running_woman'],
    tags: ['exercise', 'workout', 'marathon'],
    skin_tones: true
  },
  {
    emoji: '💃',
    description: 'woman dancing',
    category: 'People & Body',
    aliases: ['woman_dancing', 'dancer'],
    tags: ['dress'],
    skin_tones: true
  },
  {
    emoji: '🕺',
    description: 'man dancing',
    category: 'People & Body',
    aliases: ['man_dancing'],
    tags: ['dancer'],
    skin_tones: true
  },
  {
    emoji: '🕴️',
    description: 'person in suit levitating',
    category: 'People & Body',
    aliases: ['business_suit_levitating'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👯',
    description: 'people with bunny ears',
    category: 'People & Body',
    aliases: ['dancers'],
    tags: ['bunny']
  },
  {
    emoji: '👯‍♂️',
    description: 'men with bunny ears',
    category: 'People & Body',
    aliases: ['dancing_men'],
    tags: ['bunny']
  },
  {
    emoji: '👯‍♀️',
    description: 'women with bunny ears',
    category: 'People & Body',
    aliases: ['dancing_women'],
    tags: ['bunny']
  },
  {
    emoji: '🧖',
    description: 'person in steamy room',
    category: 'People & Body',
    aliases: ['sauna_person'],
    tags: ['steamy'],
    skin_tones: true
  },
  {
    emoji: '🧖‍♂️',
    description: 'man in steamy room',
    category: 'People & Body',
    aliases: ['sauna_man'],
    tags: ['steamy'],
    skin_tones: true
  },
  {
    emoji: '🧖‍♀️',
    description: 'woman in steamy room',
    category: 'People & Body',
    aliases: ['sauna_woman'],
    tags: ['steamy'],
    skin_tones: true
  },
  {
    emoji: '🧗',
    description: 'person climbing',
    category: 'People & Body',
    aliases: ['climbing'],
    tags: ['bouldering'],
    skin_tones: true
  },
  {
    emoji: '🧗‍♂️',
    description: 'man climbing',
    category: 'People & Body',
    aliases: ['climbing_man'],
    tags: ['bouldering'],
    skin_tones: true
  },
  {
    emoji: '🧗‍♀️',
    description: 'woman climbing',
    category: 'People & Body',
    aliases: ['climbing_woman'],
    tags: ['bouldering'],
    skin_tones: true
  },
  {
    emoji: '🤺',
    description: 'person fencing',
    category: 'People & Body',
    aliases: ['person_fencing'],
    tags: []
  },
  {
    emoji: '🏇',
    description: 'horse racing',
    category: 'People & Body',
    aliases: ['horse_racing'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '⛷️',
    description: 'skier',
    category: 'People & Body',
    aliases: ['skier'],
    tags: []
  },
  {
    emoji: '🏂',
    description: 'snowboarder',
    category: 'People & Body',
    aliases: ['snowboarder'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🏌️',
    description: 'person golfing',
    category: 'People & Body',
    aliases: ['golfing'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🏌️‍♂️',
    description: 'man golfing',
    category: 'People & Body',
    aliases: ['golfing_man'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🏌️‍♀️',
    description: 'woman golfing',
    category: 'People & Body',
    aliases: ['golfing_woman'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🏄',
    description: 'person surfing',
    category: 'People & Body',
    aliases: ['surfer'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🏄‍♂️',
    description: 'man surfing',
    category: 'People & Body',
    aliases: ['surfing_man'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🏄‍♀️',
    description: 'woman surfing',
    category: 'People & Body',
    aliases: ['surfing_woman'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🚣',
    description: 'person rowing boat',
    category: 'People & Body',
    aliases: ['rowboat'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🚣‍♂️',
    description: 'man rowing boat',
    category: 'People & Body',
    aliases: ['rowing_man'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🚣‍♀️',
    description: 'woman rowing boat',
    category: 'People & Body',
    aliases: ['rowing_woman'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🏊',
    description: 'person swimming',
    category: 'People & Body',
    aliases: ['swimmer'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🏊‍♂️',
    description: 'man swimming',
    category: 'People & Body',
    aliases: ['swimming_man'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🏊‍♀️',
    description: 'woman swimming',
    category: 'People & Body',
    aliases: ['swimming_woman'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '⛹️',
    description: 'person bouncing ball',
    category: 'People & Body',
    aliases: ['bouncing_ball_person'],
    tags: ['basketball'],
    skin_tones: true
  },
  {
    emoji: '⛹️‍♂️',
    description: 'man bouncing ball',
    category: 'People & Body',
    aliases: ['bouncing_ball_man', 'basketball_man'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '⛹️‍♀️',
    description: 'woman bouncing ball',
    category: 'People & Body',
    aliases: ['bouncing_ball_woman', 'basketball_woman'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🏋️',
    description: 'person lifting weights',
    category: 'People & Body',
    aliases: ['weight_lifting'],
    tags: ['gym', 'workout'],
    skin_tones: true
  },
  {
    emoji: '🏋️‍♂️',
    description: 'man lifting weights',
    category: 'People & Body',
    aliases: ['weight_lifting_man'],
    tags: ['gym', 'workout'],
    skin_tones: true
  },
  {
    emoji: '🏋️‍♀️',
    description: 'woman lifting weights',
    category: 'People & Body',
    aliases: ['weight_lifting_woman'],
    tags: ['gym', 'workout'],
    skin_tones: true
  },
  {
    emoji: '🚴',
    description: 'person biking',
    category: 'People & Body',
    aliases: ['bicyclist'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🚴‍♂️',
    description: 'man biking',
    category: 'People & Body',
    aliases: ['biking_man'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🚴‍♀️',
    description: 'woman biking',
    category: 'People & Body',
    aliases: ['biking_woman'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🚵',
    description: 'person mountain biking',
    category: 'People & Body',
    aliases: ['mountain_bicyclist'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🚵‍♂️',
    description: 'man mountain biking',
    category: 'People & Body',
    aliases: ['mountain_biking_man'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🚵‍♀️',
    description: 'woman mountain biking',
    category: 'People & Body',
    aliases: ['mountain_biking_woman'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🤸',
    description: 'person cartwheeling',
    category: 'People & Body',
    aliases: ['cartwheeling'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🤸‍♂️',
    description: 'man cartwheeling',
    category: 'People & Body',
    aliases: ['man_cartwheeling'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🤸‍♀️',
    description: 'woman cartwheeling',
    category: 'People & Body',
    aliases: ['woman_cartwheeling'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🤼',
    description: 'people wrestling',
    category: 'People & Body',
    aliases: ['wrestling'],
    tags: []
  },
  {
    emoji: '🤼‍♂️',
    description: 'men wrestling',
    category: 'People & Body',
    aliases: ['men_wrestling'],
    tags: []
  },
  {
    emoji: '🤼‍♀️',
    description: 'women wrestling',
    category: 'People & Body',
    aliases: ['women_wrestling'],
    tags: []
  },
  {
    emoji: '🤽',
    description: 'person playing water polo',
    category: 'People & Body',
    aliases: ['water_polo'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🤽‍♂️',
    description: 'man playing water polo',
    category: 'People & Body',
    aliases: ['man_playing_water_polo'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🤽‍♀️',
    description: 'woman playing water polo',
    category: 'People & Body',
    aliases: ['woman_playing_water_polo'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🤾',
    description: 'person playing handball',
    category: 'People & Body',
    aliases: ['handball_person'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🤾‍♂️',
    description: 'man playing handball',
    category: 'People & Body',
    aliases: ['man_playing_handball'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🤾‍♀️',
    description: 'woman playing handball',
    category: 'People & Body',
    aliases: ['woman_playing_handball'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🤹',
    description: 'person juggling',
    category: 'People & Body',
    aliases: ['juggling_person'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🤹‍♂️',
    description: 'man juggling',
    category: 'People & Body',
    aliases: ['man_juggling'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🤹‍♀️',
    description: 'woman juggling',
    category: 'People & Body',
    aliases: ['woman_juggling'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🧘',
    description: 'person in lotus position',
    category: 'People & Body',
    aliases: ['lotus_position'],
    tags: ['meditation'],
    skin_tones: true
  },
  {
    emoji: '🧘‍♂️',
    description: 'man in lotus position',
    category: 'People & Body',
    aliases: ['lotus_position_man'],
    tags: ['meditation'],
    skin_tones: true
  },
  {
    emoji: '🧘‍♀️',
    description: 'woman in lotus position',
    category: 'People & Body',
    aliases: ['lotus_position_woman'],
    tags: ['meditation'],
    skin_tones: true
  },
  {
    emoji: '🛀',
    description: 'person taking bath',
    category: 'People & Body',
    aliases: ['bath'],
    tags: ['shower'],
    skin_tones: true
  },
  {
    emoji: '🛌',
    description: 'person in bed',
    category: 'People & Body',
    aliases: ['sleeping_bed'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '🧑‍🤝‍🧑',
    description: 'people holding hands',
    category: 'People & Body',
    aliases: ['people_holding_hands'],
    tags: ['couple', 'date'],
    skin_tones: true
  },
  {
    emoji: '👭',
    description: 'women holding hands',
    category: 'People & Body',
    aliases: ['two_women_holding_hands'],
    tags: ['couple', 'date'],
    skin_tones: true
  },
  {
    emoji: '👫',
    description: 'woman and man holding hands',
    category: 'People & Body',
    aliases: ['couple'],
    tags: ['date'],
    skin_tones: true
  },
  {
    emoji: '👬',
    description: 'men holding hands',
    category: 'People & Body',
    aliases: ['two_men_holding_hands'],
    tags: ['couple', 'date'],
    skin_tones: true
  },
  {
    emoji: '💏',
    description: 'kiss',
    category: 'People & Body',
    aliases: ['couplekiss'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👩‍❤️‍💋‍👨',
    description: 'kiss: woman, man',
    category: 'People & Body',
    aliases: ['couplekiss_man_woman'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👨‍❤️‍💋‍👨',
    description: 'kiss: man, man',
    category: 'People & Body',
    aliases: ['couplekiss_man_man'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👩‍❤️‍💋‍👩',
    description: 'kiss: woman, woman',
    category: 'People & Body',
    aliases: ['couplekiss_woman_woman'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '💑',
    description: 'couple with heart',
    category: 'People & Body',
    aliases: ['couple_with_heart'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👩‍❤️‍👨',
    description: 'couple with heart: woman, man',
    category: 'People & Body',
    aliases: ['couple_with_heart_woman_man'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👨‍❤️‍👨',
    description: 'couple with heart: man, man',
    category: 'People & Body',
    aliases: ['couple_with_heart_man_man'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👩‍❤️‍👩',
    description: 'couple with heart: woman, woman',
    category: 'People & Body',
    aliases: ['couple_with_heart_woman_woman'],
    tags: [],
    skin_tones: true
  },
  {
    emoji: '👪',
    description: 'family',
    category: 'People & Body',
    aliases: ['family'],
    tags: ['home', 'parents', 'child']
  },
  {
    emoji: '👨‍👩‍👦',
    description: 'family: man, woman, boy',
    category: 'People & Body',
    aliases: ['family_man_woman_boy'],
    tags: []
  },
  {
    emoji: '👨‍👩‍👧',
    description: 'family: man, woman, girl',
    category: 'People & Body',
    aliases: ['family_man_woman_girl'],
    tags: []
  },
  {
    emoji: '👨‍👩‍👧‍👦',
    description: 'family: man, woman, girl, boy',
    category: 'People & Body',
    aliases: ['family_man_woman_girl_boy'],
    tags: []
  },
  {
    emoji: '👨‍👩‍👦‍👦',
    description: 'family: man, woman, boy, boy',
    category: 'People & Body',
    aliases: ['family_man_woman_boy_boy'],
    tags: []
  },
  {
    emoji: '👨‍👩‍👧‍👧',
    description: 'family: man, woman, girl, girl',
    category: 'People & Body',
    aliases: ['family_man_woman_girl_girl'],
    tags: []
  },
  {
    emoji: '👨‍👨‍👦',
    description: 'family: man, man, boy',
    category: 'People & Body',
    aliases: ['family_man_man_boy'],
    tags: []
  },
  {
    emoji: '👨‍👨‍👧',
    description: 'family: man, man, girl',
    category: 'People & Body',
    aliases: ['family_man_man_girl'],
    tags: []
  },
  {
    emoji: '👨‍👨‍👧‍👦',
    description: 'family: man, man, girl, boy',
    category: 'People & Body',
    aliases: ['family_man_man_girl_boy'],
    tags: []
  },
  {
    emoji: '👨‍👨‍👦‍👦',
    description: 'family: man, man, boy, boy',
    category: 'People & Body',
    aliases: ['family_man_man_boy_boy'],
    tags: []
  },
  {
    emoji: '👨‍👨‍👧‍👧',
    description: 'family: man, man, girl, girl',
    category: 'People & Body',
    aliases: ['family_man_man_girl_girl'],
    tags: []
  },
  {
    emoji: '👩‍👩‍👦',
    description: 'family: woman, woman, boy',
    category: 'People & Body',
    aliases: ['family_woman_woman_boy'],
    tags: []
  },
  {
    emoji: '👩‍👩‍👧',
    description: 'family: woman, woman, girl',
    category: 'People & Body',
    aliases: ['family_woman_woman_girl'],
    tags: []
  },
  {
    emoji: '👩‍👩‍👧‍👦',
    description: 'family: woman, woman, girl, boy',
    category: 'People & Body',
    aliases: ['family_woman_woman_girl_boy'],
    tags: []
  },
  {
    emoji: '👩‍👩‍👦‍👦',
    description: 'family: woman, woman, boy, boy',
    category: 'People & Body',
    aliases: ['family_woman_woman_boy_boy'],
    tags: []
  },
  {
    emoji: '👩‍👩‍👧‍👧',
    description: 'family: woman, woman, girl, girl',
    category: 'People & Body',
    aliases: ['family_woman_woman_girl_girl'],
    tags: []
  },
  {
    emoji: '👨‍👦',
    description: 'family: man, boy',
    category: 'People & Body',
    aliases: ['family_man_boy'],
    tags: []
  },
  {
    emoji: '👨‍👦‍👦',
    description: 'family: man, boy, boy',
    category: 'People & Body',
    aliases: ['family_man_boy_boy'],
    tags: []
  },
  {
    emoji: '👨‍👧',
    description: 'family: man, girl',
    category: 'People & Body',
    aliases: ['family_man_girl'],
    tags: []
  },
  {
    emoji: '👨‍👧‍👦',
    description: 'family: man, girl, boy',
    category: 'People & Body',
    aliases: ['family_man_girl_boy'],
    tags: []
  },
  {
    emoji: '👨‍👧‍👧',
    description: 'family: man, girl, girl',
    category: 'People & Body',
    aliases: ['family_man_girl_girl'],
    tags: []
  },
  {
    emoji: '👩‍👦',
    description: 'family: woman, boy',
    category: 'People & Body',
    aliases: ['family_woman_boy'],
    tags: []
  },
  {
    emoji: '👩‍👦‍👦',
    description: 'family: woman, boy, boy',
    category: 'People & Body',
    aliases: ['family_woman_boy_boy'],
    tags: []
  },
  {
    emoji: '👩‍👧',
    description: 'family: woman, girl',
    category: 'People & Body',
    aliases: ['family_woman_girl'],
    tags: []
  },
  {
    emoji: '👩‍👧‍👦',
    description: 'family: woman, girl, boy',
    category: 'People & Body',
    aliases: ['family_woman_girl_boy'],
    tags: []
  },
  {
    emoji: '👩‍👧‍👧',
    description: 'family: woman, girl, girl',
    category: 'People & Body',
    aliases: ['family_woman_girl_girl'],
    tags: []
  },
  {
    emoji: '🗣️',
    description: 'speaking head',
    category: 'People & Body',
    aliases: ['speaking_head'],
    tags: []
  },
  {
    emoji: '👤',
    description: 'bust in silhouette',
    category: 'People & Body',
    aliases: ['bust_in_silhouette'],
    tags: ['user']
  },
  {
    emoji: '👥',
    description: 'busts in silhouette',
    category: 'People & Body',
    aliases: ['busts_in_silhouette'],
    tags: ['users', 'group', 'team']
  },
  {
    emoji: '🫂',
    description: 'people hugging',
    category: 'People & Body',
    aliases: ['people_hugging'],
    tags: []
  },
  {
    emoji: '👣',
    description: 'footprints',
    category: 'People & Body',
    aliases: ['footprints'],
    tags: ['feet', 'tracks']
  },
  {
    emoji: '🐵',
    description: 'monkey face',
    category: 'Animals & Nature',
    aliases: ['monkey_face'],
    tags: []
  },
  {
    emoji: '🐒',
    description: 'monkey',
    category: 'Animals & Nature',
    aliases: ['monkey'],
    tags: []
  },
  {
    emoji: '🦍',
    description: 'gorilla',
    category: 'Animals & Nature',
    aliases: ['gorilla'],
    tags: []
  },
  {
    emoji: '🦧',
    description: 'orangutan',
    category: 'Animals & Nature',
    aliases: ['orangutan'],
    tags: []
  },
  {
    emoji: '🐶',
    description: 'dog face',
    category: 'Animals & Nature',
    aliases: ['dog'],
    tags: ['pet']
  },
  {
    emoji: '🐕',
    description: 'dog',
    category: 'Animals & Nature',
    aliases: ['dog2'],
    tags: []
  },
  {
    emoji: '🦮',
    description: 'guide dog',
    category: 'Animals & Nature',
    aliases: ['guide_dog'],
    tags: []
  },
  {
    emoji: '🐕‍🦺',
    description: 'service dog',
    category: 'Animals & Nature',
    aliases: ['service_dog'],
    tags: []
  },
  {
    emoji: '🐩',
    description: 'poodle',
    category: 'Animals & Nature',
    aliases: ['poodle'],
    tags: ['dog']
  },
  {
    emoji: '🐺',
    description: 'wolf',
    category: 'Animals & Nature',
    aliases: ['wolf'],
    tags: []
  },
  {
    emoji: '🦊',
    description: 'fox',
    category: 'Animals & Nature',
    aliases: ['fox_face'],
    tags: []
  },
  {
    emoji: '🦝',
    description: 'raccoon',
    category: 'Animals & Nature',
    aliases: ['raccoon'],
    tags: []
  },
  {
    emoji: '🐱',
    description: 'cat face',
    category: 'Animals & Nature',
    aliases: ['cat'],
    tags: ['pet']
  },
  {
    emoji: '🐈',
    description: 'cat',
    category: 'Animals & Nature',
    aliases: ['cat2'],
    tags: []
  },
  {
    emoji: '🐈‍⬛',
    description: 'black cat',
    category: 'Animals & Nature',
    aliases: ['black_cat'],
    tags: []
  },
  {
    emoji: '🦁',
    description: 'lion',
    category: 'Animals & Nature',
    aliases: ['lion'],
    tags: []
  },
  {
    emoji: '🐯',
    description: 'tiger face',
    category: 'Animals & Nature',
    aliases: ['tiger'],
    tags: []
  },
  {
    emoji: '🐅',
    description: 'tiger',
    category: 'Animals & Nature',
    aliases: ['tiger2'],
    tags: []
  },
  {
    emoji: '🐆',
    description: 'leopard',
    category: 'Animals & Nature',
    aliases: ['leopard'],
    tags: []
  },
  {
    emoji: '🐴',
    description: 'horse face',
    category: 'Animals & Nature',
    aliases: ['horse'],
    tags: []
  },
  {
    emoji: '🐎',
    description: 'horse',
    category: 'Animals & Nature',
    aliases: ['racehorse'],
    tags: ['speed']
  },
  {
    emoji: '🦄',
    description: 'unicorn',
    category: 'Animals & Nature',
    aliases: ['unicorn'],
    tags: []
  },
  {
    emoji: '🦓',
    description: 'zebra',
    category: 'Animals & Nature',
    aliases: ['zebra'],
    tags: []
  },
  {
    emoji: '🦌',
    description: 'deer',
    category: 'Animals & Nature',
    aliases: ['deer'],
    tags: []
  },
  {
    emoji: '🦬',
    description: 'bison',
    category: 'Animals & Nature',
    aliases: ['bison'],
    tags: []
  },
  {
    emoji: '🐮',
    description: 'cow face',
    category: 'Animals & Nature',
    aliases: ['cow'],
    tags: []
  },
  {
    emoji: '🐂',
    description: 'ox',
    category: 'Animals & Nature',
    aliases: ['ox'],
    tags: []
  },
  {
    emoji: '🐃',
    description: 'water buffalo',
    category: 'Animals & Nature',
    aliases: ['water_buffalo'],
    tags: []
  },
  {
    emoji: '🐄',
    description: 'cow',
    category: 'Animals & Nature',
    aliases: ['cow2'],
    tags: []
  },
  {
    emoji: '🐷',
    description: 'pig face',
    category: 'Animals & Nature',
    aliases: ['pig'],
    tags: []
  },
  {
    emoji: '🐖',
    description: 'pig',
    category: 'Animals & Nature',
    aliases: ['pig2'],
    tags: []
  },
  {
    emoji: '🐗',
    description: 'boar',
    category: 'Animals & Nature',
    aliases: ['boar'],
    tags: []
  },
  {
    emoji: '🐽',
    description: 'pig nose',
    category: 'Animals & Nature',
    aliases: ['pig_nose'],
    tags: []
  },
  {
    emoji: '🐏',
    description: 'ram',
    category: 'Animals & Nature',
    aliases: ['ram'],
    tags: []
  },
  {
    emoji: '🐑',
    description: 'ewe',
    category: 'Animals & Nature',
    aliases: ['sheep'],
    tags: []
  },
  {
    emoji: '🐐',
    description: 'goat',
    category: 'Animals & Nature',
    aliases: ['goat'],
    tags: []
  },
  {
    emoji: '🐪',
    description: 'camel',
    category: 'Animals & Nature',
    aliases: ['dromedary_camel'],
    tags: ['desert']
  },
  {
    emoji: '🐫',
    description: 'two-hump camel',
    category: 'Animals & Nature',
    aliases: ['camel'],
    tags: []
  },
  {
    emoji: '🦙',
    description: 'llama',
    category: 'Animals & Nature',
    aliases: ['llama'],
    tags: []
  },
  {
    emoji: '🦒',
    description: 'giraffe',
    category: 'Animals & Nature',
    aliases: ['giraffe'],
    tags: []
  },
  {
    emoji: '🐘',
    description: 'elephant',
    category: 'Animals & Nature',
    aliases: ['elephant'],
    tags: []
  },
  {
    emoji: '🦣',
    description: 'mammoth',
    category: 'Animals & Nature',
    aliases: ['mammoth'],
    tags: []
  },
  {
    emoji: '🦏',
    description: 'rhinoceros',
    category: 'Animals & Nature',
    aliases: ['rhinoceros'],
    tags: []
  },
  {
    emoji: '🦛',
    description: 'hippopotamus',
    category: 'Animals & Nature',
    aliases: ['hippopotamus'],
    tags: []
  },
  {
    emoji: '🐭',
    description: 'mouse face',
    category: 'Animals & Nature',
    aliases: ['mouse'],
    tags: []
  },
  {
    emoji: '🐁',
    description: 'mouse',
    category: 'Animals & Nature',
    aliases: ['mouse2'],
    tags: []
  },
  {
    emoji: '🐀',
    description: 'rat',
    category: 'Animals & Nature',
    aliases: ['rat'],
    tags: []
  },
  {
    emoji: '🐹',
    description: 'hamster',
    category: 'Animals & Nature',
    aliases: ['hamster'],
    tags: ['pet']
  },
  {
    emoji: '🐰',
    description: 'rabbit face',
    category: 'Animals & Nature',
    aliases: ['rabbit'],
    tags: ['bunny']
  },
  {
    emoji: '🐇',
    description: 'rabbit',
    category: 'Animals & Nature',
    aliases: ['rabbit2'],
    tags: []
  },
  {
    emoji: '🐿️',
    description: 'chipmunk',
    category: 'Animals & Nature',
    aliases: ['chipmunk'],
    tags: []
  },
  {
    emoji: '🦫',
    description: 'beaver',
    category: 'Animals & Nature',
    aliases: ['beaver'],
    tags: []
  },
  {
    emoji: '🦔',
    description: 'hedgehog',
    category: 'Animals & Nature',
    aliases: ['hedgehog'],
    tags: []
  },
  {
    emoji: '🦇',
    description: 'bat',
    category: 'Animals & Nature',
    aliases: ['bat'],
    tags: []
  },
  {
    emoji: '🐻',
    description: 'bear',
    category: 'Animals & Nature',
    aliases: ['bear'],
    tags: []
  },
  {
    emoji: '🐻‍❄️',
    description: 'polar bear',
    category: 'Animals & Nature',
    aliases: ['polar_bear'],
    tags: []
  },
  {
    emoji: '🐨',
    description: 'koala',
    category: 'Animals & Nature',
    aliases: ['koala'],
    tags: []
  },
  {
    emoji: '🐼',
    description: 'panda',
    category: 'Animals & Nature',
    aliases: ['panda_face'],
    tags: []
  },
  {
    emoji: '🦥',
    description: 'sloth',
    category: 'Animals & Nature',
    aliases: ['sloth'],
    tags: []
  },
  {
    emoji: '🦦',
    description: 'otter',
    category: 'Animals & Nature',
    aliases: ['otter'],
    tags: []
  },
  {
    emoji: '🦨',
    description: 'skunk',
    category: 'Animals & Nature',
    aliases: ['skunk'],
    tags: []
  },
  {
    emoji: '🦘',
    description: 'kangaroo',
    category: 'Animals & Nature',
    aliases: ['kangaroo'],
    tags: []
  },
  {
    emoji: '🦡',
    description: 'badger',
    category: 'Animals & Nature',
    aliases: ['badger'],
    tags: []
  },
  {
    emoji: '🐾',
    description: 'paw prints',
    category: 'Animals & Nature',
    aliases: ['feet', 'paw_prints'],
    tags: []
  },
  {
    emoji: '🦃',
    description: 'turkey',
    category: 'Animals & Nature',
    aliases: ['turkey'],
    tags: ['thanksgiving']
  },
  {
    emoji: '🐔',
    description: 'chicken',
    category: 'Animals & Nature',
    aliases: ['chicken'],
    tags: []
  },
  {
    emoji: '🐓',
    description: 'rooster',
    category: 'Animals & Nature',
    aliases: ['rooster'],
    tags: []
  },
  {
    emoji: '🐣',
    description: 'hatching chick',
    category: 'Animals & Nature',
    aliases: ['hatching_chick'],
    tags: []
  },
  {
    emoji: '🐤',
    description: 'baby chick',
    category: 'Animals & Nature',
    aliases: ['baby_chick'],
    tags: []
  },
  {
    emoji: '🐥',
    description: 'front-facing baby chick',
    category: 'Animals & Nature',
    aliases: ['hatched_chick'],
    tags: []
  },
  {
    emoji: '🐦',
    description: 'bird',
    category: 'Animals & Nature',
    aliases: ['bird'],
    tags: []
  },
  {
    emoji: '🐧',
    description: 'penguin',
    category: 'Animals & Nature',
    aliases: ['penguin'],
    tags: []
  },
  {
    emoji: '🕊️',
    description: 'dove',
    category: 'Animals & Nature',
    aliases: ['dove'],
    tags: ['peace']
  },
  {
    emoji: '🦅',
    description: 'eagle',
    category: 'Animals & Nature',
    aliases: ['eagle'],
    tags: []
  },
  {
    emoji: '🦆',
    description: 'duck',
    category: 'Animals & Nature',
    aliases: ['duck'],
    tags: []
  },
  {
    emoji: '🦢',
    description: 'swan',
    category: 'Animals & Nature',
    aliases: ['swan'],
    tags: []
  },
  {
    emoji: '🦉',
    description: 'owl',
    category: 'Animals & Nature',
    aliases: ['owl'],
    tags: []
  },
  {
    emoji: '🦤',
    description: 'dodo',
    category: 'Animals & Nature',
    aliases: ['dodo'],
    tags: []
  },
  {
    emoji: '🪶',
    description: 'feather',
    category: 'Animals & Nature',
    aliases: ['feather'],
    tags: []
  },
  {
    emoji: '🦩',
    description: 'flamingo',
    category: 'Animals & Nature',
    aliases: ['flamingo'],
    tags: []
  },
  {
    emoji: '🦚',
    description: 'peacock',
    category: 'Animals & Nature',
    aliases: ['peacock'],
    tags: []
  },
  {
    emoji: '🦜',
    description: 'parrot',
    category: 'Animals & Nature',
    aliases: ['parrot'],
    tags: []
  },
  {
    emoji: '🐸',
    description: 'frog',
    category: 'Animals & Nature',
    aliases: ['frog'],
    tags: []
  },
  {
    emoji: '🐊',
    description: 'crocodile',
    category: 'Animals & Nature',
    aliases: ['crocodile'],
    tags: []
  },
  {
    emoji: '🐢',
    description: 'turtle',
    category: 'Animals & Nature',
    aliases: ['turtle'],
    tags: ['slow']
  },
  {
    emoji: '🦎',
    description: 'lizard',
    category: 'Animals & Nature',
    aliases: ['lizard'],
    tags: []
  },
  {
    emoji: '🐍',
    description: 'snake',
    category: 'Animals & Nature',
    aliases: ['snake'],
    tags: []
  },
  {
    emoji: '🐲',
    description: 'dragon face',
    category: 'Animals & Nature',
    aliases: ['dragon_face'],
    tags: []
  },
  {
    emoji: '🐉',
    description: 'dragon',
    category: 'Animals & Nature',
    aliases: ['dragon'],
    tags: []
  },
  {
    emoji: '🦕',
    description: 'sauropod',
    category: 'Animals & Nature',
    aliases: ['sauropod'],
    tags: ['dinosaur']
  },
  {
    emoji: '🦖',
    description: 'T-Rex',
    category: 'Animals & Nature',
    aliases: ['t-rex'],
    tags: ['dinosaur']
  },
  {
    emoji: '🐳',
    description: 'spouting whale',
    category: 'Animals & Nature',
    aliases: ['whale'],
    tags: ['sea']
  },
  {
    emoji: '🐋',
    description: 'whale',
    category: 'Animals & Nature',
    aliases: ['whale2'],
    tags: []
  },
  {
    emoji: '🐬',
    description: 'dolphin',
    category: 'Animals & Nature',
    aliases: ['dolphin', 'flipper'],
    tags: []
  },
  {
    emoji: '🦭',
    description: 'seal',
    category: 'Animals & Nature',
    aliases: ['seal'],
    tags: []
  },
  {
    emoji: '🐟',
    description: 'fish',
    category: 'Animals & Nature',
    aliases: ['fish'],
    tags: []
  },
  {
    emoji: '🐠',
    description: 'tropical fish',
    category: 'Animals & Nature',
    aliases: ['tropical_fish'],
    tags: []
  },
  {
    emoji: '🐡',
    description: 'blowfish',
    category: 'Animals & Nature',
    aliases: ['blowfish'],
    tags: []
  },
  {
    emoji: '🦈',
    description: 'shark',
    category: 'Animals & Nature',
    aliases: ['shark'],
    tags: []
  },
  {
    emoji: '🐙',
    description: 'octopus',
    category: 'Animals & Nature',
    aliases: ['octopus'],
    tags: []
  },
  {
    emoji: '🐚',
    description: 'spiral shell',
    category: 'Animals & Nature',
    aliases: ['shell'],
    tags: ['sea', 'beach']
  },
  {
    emoji: '🐌',
    description: 'snail',
    category: 'Animals & Nature',
    aliases: ['snail'],
    tags: ['slow']
  },
  {
    emoji: '🦋',
    description: 'butterfly',
    category: 'Animals & Nature',
    aliases: ['butterfly'],
    tags: []
  },
  {
    emoji: '🐛',
    description: 'bug',
    category: 'Animals & Nature',
    aliases: ['bug'],
    tags: []
  },
  {
    emoji: '🐜',
    description: 'ant',
    category: 'Animals & Nature',
    aliases: ['ant'],
    tags: []
  },
  {
    emoji: '🐝',
    description: 'honeybee',
    category: 'Animals & Nature',
    aliases: ['bee', 'honeybee'],
    tags: []
  },
  {
    emoji: '🪲',
    description: 'beetle',
    category: 'Animals & Nature',
    aliases: ['beetle'],
    tags: []
  },
  {
    emoji: '🐞',
    description: 'lady beetle',
    category: 'Animals & Nature',
    aliases: ['lady_beetle'],
    tags: ['bug']
  },
  {
    emoji: '🦗',
    description: 'cricket',
    category: 'Animals & Nature',
    aliases: ['cricket'],
    tags: []
  },
  {
    emoji: '🪳',
    description: 'cockroach',
    category: 'Animals & Nature',
    aliases: ['cockroach'],
    tags: []
  },
  {
    emoji: '🕷️',
    description: 'spider',
    category: 'Animals & Nature',
    aliases: ['spider'],
    tags: []
  },
  {
    emoji: '🕸️',
    description: 'spider web',
    category: 'Animals & Nature',
    aliases: ['spider_web'],
    tags: []
  },
  {
    emoji: '🦂',
    description: 'scorpion',
    category: 'Animals & Nature',
    aliases: ['scorpion'],
    tags: []
  },
  {
    emoji: '🦟',
    description: 'mosquito',
    category: 'Animals & Nature',
    aliases: ['mosquito'],
    tags: []
  },
  {
    emoji: '🪰',
    description: 'fly',
    category: 'Animals & Nature',
    aliases: ['fly'],
    tags: []
  },
  {
    emoji: '🪱',
    description: 'worm',
    category: 'Animals & Nature',
    aliases: ['worm'],
    tags: []
  },
  {
    emoji: '🦠',
    description: 'microbe',
    category: 'Animals & Nature',
    aliases: ['microbe'],
    tags: ['germ']
  },
  {
    emoji: '💐',
    description: 'bouquet',
    category: 'Animals & Nature',
    aliases: ['bouquet'],
    tags: ['flowers']
  },
  {
    emoji: '🌸',
    description: 'cherry blossom',
    category: 'Animals & Nature',
    aliases: ['cherry_blossom'],
    tags: ['flower', 'spring']
  },
  {
    emoji: '💮',
    description: 'white flower',
    category: 'Animals & Nature',
    aliases: ['white_flower'],
    tags: []
  },
  {
    emoji: '🏵️',
    description: 'rosette',
    category: 'Animals & Nature',
    aliases: ['rosette'],
    tags: []
  },
  {
    emoji: '🌹',
    description: 'rose',
    category: 'Animals & Nature',
    aliases: ['rose'],
    tags: ['flower']
  },
  {
    emoji: '🥀',
    description: 'wilted flower',
    category: 'Animals & Nature',
    aliases: ['wilted_flower'],
    tags: []
  },
  {
    emoji: '🌺',
    description: 'hibiscus',
    category: 'Animals & Nature',
    aliases: ['hibiscus'],
    tags: []
  },
  {
    emoji: '🌻',
    description: 'sunflower',
    category: 'Animals & Nature',
    aliases: ['sunflower'],
    tags: []
  },
  {
    emoji: '🌼',
    description: 'blossom',
    category: 'Animals & Nature',
    aliases: ['blossom'],
    tags: []
  },
  {
    emoji: '🌷',
    description: 'tulip',
    category: 'Animals & Nature',
    aliases: ['tulip'],
    tags: ['flower']
  },
  {
    emoji: '🌱',
    description: 'seedling',
    category: 'Animals & Nature',
    aliases: ['seedling'],
    tags: ['plant']
  },
  {
    emoji: '🪴',
    description: 'potted plant',
    category: 'Animals & Nature',
    aliases: ['potted_plant'],
    tags: []
  },
  {
    emoji: '🌲',
    description: 'evergreen tree',
    category: 'Animals & Nature',
    aliases: ['evergreen_tree'],
    tags: ['wood']
  },
  {
    emoji: '🌳',
    description: 'deciduous tree',
    category: 'Animals & Nature',
    aliases: ['deciduous_tree'],
    tags: ['wood']
  },
  {
    emoji: '🌴',
    description: 'palm tree',
    category: 'Animals & Nature',
    aliases: ['palm_tree'],
    tags: []
  },
  {
    emoji: '🌵',
    description: 'cactus',
    category: 'Animals & Nature',
    aliases: ['cactus'],
    tags: []
  },
  {
    emoji: '🌾',
    description: 'sheaf of rice',
    category: 'Animals & Nature',
    aliases: ['ear_of_rice'],
    tags: []
  },
  {
    emoji: '🌿',
    description: 'herb',
    category: 'Animals & Nature',
    aliases: ['herb'],
    tags: []
  },
  {
    emoji: '☘️',
    description: 'shamrock',
    category: 'Animals & Nature',
    aliases: ['shamrock'],
    tags: []
  },
  {
    emoji: '🍀',
    description: 'four leaf clover',
    category: 'Animals & Nature',
    aliases: ['four_leaf_clover'],
    tags: ['luck']
  },
  {
    emoji: '🍁',
    description: 'maple leaf',
    category: 'Animals & Nature',
    aliases: ['maple_leaf'],
    tags: ['canada']
  },
  {
    emoji: '🍂',
    description: 'fallen leaf',
    category: 'Animals & Nature',
    aliases: ['fallen_leaf'],
    tags: ['autumn']
  },
  {
    emoji: '🍃',
    description: 'leaf fluttering in wind',
    category: 'Animals & Nature',
    aliases: ['leaves'],
    tags: ['leaf']
  },
  {
    emoji: '🍇',
    description: 'grapes',
    category: 'Food & Drink',
    aliases: ['grapes'],
    tags: []
  },
  {
    emoji: '🍈',
    description: 'melon',
    category: 'Food & Drink',
    aliases: ['melon'],
    tags: []
  },
  {
    emoji: '🍉',
    description: 'watermelon',
    category: 'Food & Drink',
    aliases: ['watermelon'],
    tags: []
  },
  {
    emoji: '🍊',
    description: 'tangerine',
    category: 'Food & Drink',
    aliases: ['tangerine', 'orange', 'mandarin'],
    tags: []
  },
  {
    emoji: '🍋',
    description: 'lemon',
    category: 'Food & Drink',
    aliases: ['lemon'],
    tags: []
  },
  {
    emoji: '🍌',
    description: 'banana',
    category: 'Food & Drink',
    aliases: ['banana'],
    tags: ['fruit']
  },
  {
    emoji: '🍍',
    description: 'pineapple',
    category: 'Food & Drink',
    aliases: ['pineapple'],
    tags: []
  },
  {
    emoji: '🥭',
    description: 'mango',
    category: 'Food & Drink',
    aliases: ['mango'],
    tags: []
  },
  {
    emoji: '🍎',
    description: 'red apple',
    category: 'Food & Drink',
    aliases: ['apple'],
    tags: []
  },
  {
    emoji: '🍏',
    description: 'green apple',
    category: 'Food & Drink',
    aliases: ['green_apple'],
    tags: ['fruit']
  },
  {
    emoji: '🍐',
    description: 'pear',
    category: 'Food & Drink',
    aliases: ['pear'],
    tags: []
  },
  {
    emoji: '🍑',
    description: 'peach',
    category: 'Food & Drink',
    aliases: ['peach'],
    tags: []
  },
  {
    emoji: '🍒',
    description: 'cherries',
    category: 'Food & Drink',
    aliases: ['cherries'],
    tags: ['fruit']
  },
  {
    emoji: '🍓',
    description: 'strawberry',
    category: 'Food & Drink',
    aliases: ['strawberry'],
    tags: ['fruit']
  },
  {
    emoji: '🫐',
    description: 'blueberries',
    category: 'Food & Drink',
    aliases: ['blueberries'],
    tags: []
  },
  {
    emoji: '🥝',
    description: 'kiwi fruit',
    category: 'Food & Drink',
    aliases: ['kiwi_fruit'],
    tags: []
  },
  {
    emoji: '🍅',
    description: 'tomato',
    category: 'Food & Drink',
    aliases: ['tomato'],
    tags: []
  },
  {
    emoji: '🫒',
    description: 'olive',
    category: 'Food & Drink',
    aliases: ['olive'],
    tags: []
  },
  {
    emoji: '🥥',
    description: 'coconut',
    category: 'Food & Drink',
    aliases: ['coconut'],
    tags: []
  },
  {
    emoji: '🥑',
    description: 'avocado',
    category: 'Food & Drink',
    aliases: ['avocado'],
    tags: []
  },
  {
    emoji: '🍆',
    description: 'eggplant',
    category: 'Food & Drink',
    aliases: ['eggplant'],
    tags: ['aubergine']
  },
  {
    emoji: '🥔',
    description: 'potato',
    category: 'Food & Drink',
    aliases: ['potato'],
    tags: []
  },
  {
    emoji: '🥕',
    description: 'carrot',
    category: 'Food & Drink',
    aliases: ['carrot'],
    tags: []
  },
  {
    emoji: '🌽',
    description: 'ear of corn',
    category: 'Food & Drink',
    aliases: ['corn'],
    tags: []
  },
  {
    emoji: '🌶️',
    description: 'hot pepper',
    category: 'Food & Drink',
    aliases: ['hot_pepper'],
    tags: ['spicy']
  },
  {
    emoji: '🫑',
    description: 'bell pepper',
    category: 'Food & Drink',
    aliases: ['bell_pepper'],
    tags: []
  },
  {
    emoji: '🥒',
    description: 'cucumber',
    category: 'Food & Drink',
    aliases: ['cucumber'],
    tags: []
  },
  {
    emoji: '🥬',
    description: 'leafy green',
    category: 'Food & Drink',
    aliases: ['leafy_green'],
    tags: []
  },
  {
    emoji: '🥦',
    description: 'broccoli',
    category: 'Food & Drink',
    aliases: ['broccoli'],
    tags: []
  },
  {
    emoji: '🧄',
    description: 'garlic',
    category: 'Food & Drink',
    aliases: ['garlic'],
    tags: []
  },
  {
    emoji: '🧅',
    description: 'onion',
    category: 'Food & Drink',
    aliases: ['onion'],
    tags: []
  },
  {
    emoji: '🍄',
    description: 'mushroom',
    category: 'Food & Drink',
    aliases: ['mushroom'],
    tags: []
  },
  {
    emoji: '🥜',
    description: 'peanuts',
    category: 'Food & Drink',
    aliases: ['peanuts'],
    tags: []
  },
  {
    emoji: '🌰',
    description: 'chestnut',
    category: 'Food & Drink',
    aliases: ['chestnut'],
    tags: []
  },
  {
    emoji: '🍞',
    description: 'bread',
    category: 'Food & Drink',
    aliases: ['bread'],
    tags: ['toast']
  },
  {
    emoji: '🥐',
    description: 'croissant',
    category: 'Food & Drink',
    aliases: ['croissant'],
    tags: []
  },
  {
    emoji: '🥖',
    description: 'baguette bread',
    category: 'Food & Drink',
    aliases: ['baguette_bread'],
    tags: []
  },
  {
    emoji: '🫓',
    description: 'flatbread',
    category: 'Food & Drink',
    aliases: ['flatbread'],
    tags: []
  },
  {
    emoji: '🥨',
    description: 'pretzel',
    category: 'Food & Drink',
    aliases: ['pretzel'],
    tags: []
  },
  {
    emoji: '🥯',
    description: 'bagel',
    category: 'Food & Drink',
    aliases: ['bagel'],
    tags: []
  },
  {
    emoji: '🥞',
    description: 'pancakes',
    category: 'Food & Drink',
    aliases: ['pancakes'],
    tags: []
  },
  {
    emoji: '🧇',
    description: 'waffle',
    category: 'Food & Drink',
    aliases: ['waffle'],
    tags: []
  },
  {
    emoji: '🧀',
    description: 'cheese wedge',
    category: 'Food & Drink',
    aliases: ['cheese'],
    tags: []
  },
  {
    emoji: '🍖',
    description: 'meat on bone',
    category: 'Food & Drink',
    aliases: ['meat_on_bone'],
    tags: []
  },
  {
    emoji: '🍗',
    description: 'poultry leg',
    category: 'Food & Drink',
    aliases: ['poultry_leg'],
    tags: ['meat', 'chicken']
  },
  {
    emoji: '🥩',
    description: 'cut of meat',
    category: 'Food & Drink',
    aliases: ['cut_of_meat'],
    tags: []
  },
  {
    emoji: '🥓',
    description: 'bacon',
    category: 'Food & Drink',
    aliases: ['bacon'],
    tags: []
  },
  {
    emoji: '🍔',
    description: 'hamburger',
    category: 'Food & Drink',
    aliases: ['hamburger'],
    tags: ['burger']
  },
  {
    emoji: '🍟',
    description: 'french fries',
    category: 'Food & Drink',
    aliases: ['fries'],
    tags: []
  },
  {
    emoji: '🍕',
    description: 'pizza',
    category: 'Food & Drink',
    aliases: ['pizza'],
    tags: []
  },
  {
    emoji: '🌭',
    description: 'hot dog',
    category: 'Food & Drink',
    aliases: ['hotdog'],
    tags: []
  },
  {
    emoji: '🥪',
    description: 'sandwich',
    category: 'Food & Drink',
    aliases: ['sandwich'],
    tags: []
  },
  {
    emoji: '🌮',
    description: 'taco',
    category: 'Food & Drink',
    aliases: ['taco'],
    tags: []
  },
  {
    emoji: '🌯',
    description: 'burrito',
    category: 'Food & Drink',
    aliases: ['burrito'],
    tags: []
  },
  {
    emoji: '🫔',
    description: 'tamale',
    category: 'Food & Drink',
    aliases: ['tamale'],
    tags: []
  },
  {
    emoji: '🥙',
    description: 'stuffed flatbread',
    category: 'Food & Drink',
    aliases: ['stuffed_flatbread'],
    tags: []
  },
  {
    emoji: '🧆',
    description: 'falafel',
    category: 'Food & Drink',
    aliases: ['falafel'],
    tags: []
  },
  {
    emoji: '🥚',
    description: 'egg',
    category: 'Food & Drink',
    aliases: ['egg'],
    tags: []
  },
  {
    emoji: '🍳',
    description: 'cooking',
    category: 'Food & Drink',
    aliases: ['fried_egg'],
    tags: ['breakfast']
  },
  {
    emoji: '🥘',
    description: 'shallow pan of food',
    category: 'Food & Drink',
    aliases: ['shallow_pan_of_food'],
    tags: ['paella', 'curry']
  },
  {
    emoji: '🍲',
    description: 'pot of food',
    category: 'Food & Drink',
    aliases: ['stew'],
    tags: []
  },
  {
    emoji: '🫕',
    description: 'fondue',
    category: 'Food & Drink',
    aliases: ['fondue'],
    tags: []
  },
  {
    emoji: '🥣',
    description: 'bowl with spoon',
    category: 'Food & Drink',
    aliases: ['bowl_with_spoon'],
    tags: []
  },
  {
    emoji: '🥗',
    description: 'green salad',
    category: 'Food & Drink',
    aliases: ['green_salad'],
    tags: []
  },
  {
    emoji: '🍿',
    description: 'popcorn',
    category: 'Food & Drink',
    aliases: ['popcorn'],
    tags: []
  },
  {
    emoji: '🧈',
    description: 'butter',
    category: 'Food & Drink',
    aliases: ['butter'],
    tags: []
  },
  {
    emoji: '🧂',
    description: 'salt',
    category: 'Food & Drink',
    aliases: ['salt'],
    tags: []
  },
  {
    emoji: '🥫',
    description: 'canned food',
    category: 'Food & Drink',
    aliases: ['canned_food'],
    tags: []
  },
  {
    emoji: '🍱',
    description: 'bento box',
    category: 'Food & Drink',
    aliases: ['bento'],
    tags: []
  },
  {
    emoji: '🍘',
    description: 'rice cracker',
    category: 'Food & Drink',
    aliases: ['rice_cracker'],
    tags: []
  },
  {
    emoji: '🍙',
    description: 'rice ball',
    category: 'Food & Drink',
    aliases: ['rice_ball'],
    tags: []
  },
  {
    emoji: '🍚',
    description: 'cooked rice',
    category: 'Food & Drink',
    aliases: ['rice'],
    tags: []
  },
  {
    emoji: '🍛',
    description: 'curry rice',
    category: 'Food & Drink',
    aliases: ['curry'],
    tags: []
  },
  {
    emoji: '🍜',
    description: 'steaming bowl',
    category: 'Food & Drink',
    aliases: ['ramen'],
    tags: ['noodle']
  },
  {
    emoji: '🍝',
    description: 'spaghetti',
    category: 'Food & Drink',
    aliases: ['spaghetti'],
    tags: ['pasta']
  },
  {
    emoji: '🍠',
    description: 'roasted sweet potato',
    category: 'Food & Drink',
    aliases: ['sweet_potato'],
    tags: []
  },
  {
    emoji: '🍢',
    description: 'oden',
    category: 'Food & Drink',
    aliases: ['oden'],
    tags: []
  },
  {
    emoji: '🍣',
    description: 'sushi',
    category: 'Food & Drink',
    aliases: ['sushi'],
    tags: []
  },
  {
    emoji: '🍤',
    description: 'fried shrimp',
    category: 'Food & Drink',
    aliases: ['fried_shrimp'],
    tags: ['tempura']
  },
  {
    emoji: '🍥',
    description: 'fish cake with swirl',
    category: 'Food & Drink',
    aliases: ['fish_cake'],
    tags: []
  },
  {
    emoji: '🥮',
    description: 'moon cake',
    category: 'Food & Drink',
    aliases: ['moon_cake'],
    tags: []
  },
  {
    emoji: '🍡',
    description: 'dango',
    category: 'Food & Drink',
    aliases: ['dango'],
    tags: []
  },
  {
    emoji: '🥟',
    description: 'dumpling',
    category: 'Food & Drink',
    aliases: ['dumpling'],
    tags: []
  },
  {
    emoji: '🥠',
    description: 'fortune cookie',
    category: 'Food & Drink',
    aliases: ['fortune_cookie'],
    tags: []
  },
  {
    emoji: '🥡',
    description: 'takeout box',
    category: 'Food & Drink',
    aliases: ['takeout_box'],
    tags: []
  },
  {
    emoji: '🦀',
    description: 'crab',
    category: 'Food & Drink',
    aliases: ['crab'],
    tags: []
  },
  {
    emoji: '🦞',
    description: 'lobster',
    category: 'Food & Drink',
    aliases: ['lobster'],
    tags: []
  },
  {
    emoji: '🦐',
    description: 'shrimp',
    category: 'Food & Drink',
    aliases: ['shrimp'],
    tags: []
  },
  {
    emoji: '🦑',
    description: 'squid',
    category: 'Food & Drink',
    aliases: ['squid'],
    tags: []
  },
  {
    emoji: '🦪',
    description: 'oyster',
    category: 'Food & Drink',
    aliases: ['oyster'],
    tags: []
  },
  {
    emoji: '🍦',
    description: 'soft ice cream',
    category: 'Food & Drink',
    aliases: ['icecream'],
    tags: []
  },
  {
    emoji: '🍧',
    description: 'shaved ice',
    category: 'Food & Drink',
    aliases: ['shaved_ice'],
    tags: []
  },
  {
    emoji: '🍨',
    description: 'ice cream',
    category: 'Food & Drink',
    aliases: ['ice_cream'],
    tags: []
  },
  {
    emoji: '🍩',
    description: 'doughnut',
    category: 'Food & Drink',
    aliases: ['doughnut'],
    tags: []
  },
  {
    emoji: '🍪',
    description: 'cookie',
    category: 'Food & Drink',
    aliases: ['cookie'],
    tags: []
  },
  {
    emoji: '🎂',
    description: 'birthday cake',
    category: 'Food & Drink',
    aliases: ['birthday'],
    tags: ['party']
  },
  {
    emoji: '🍰',
    description: 'shortcake',
    category: 'Food & Drink',
    aliases: ['cake'],
    tags: ['dessert']
  },
  {
    emoji: '🧁',
    description: 'cupcake',
    category: 'Food & Drink',
    aliases: ['cupcake'],
    tags: []
  },
  {
    emoji: '🥧',
    description: 'pie',
    category: 'Food & Drink',
    aliases: ['pie'],
    tags: []
  },
  {
    emoji: '🍫',
    description: 'chocolate bar',
    category: 'Food & Drink',
    aliases: ['chocolate_bar'],
    tags: []
  },
  {
    emoji: '🍬',
    description: 'candy',
    category: 'Food & Drink',
    aliases: ['candy'],
    tags: ['sweet']
  },
  {
    emoji: '🍭',
    description: 'lollipop',
    category: 'Food & Drink',
    aliases: ['lollipop'],
    tags: []
  },
  {
    emoji: '🍮',
    description: 'custard',
    category: 'Food & Drink',
    aliases: ['custard'],
    tags: []
  },
  {
    emoji: '🍯',
    description: 'honey pot',
    category: 'Food & Drink',
    aliases: ['honey_pot'],
    tags: []
  },
  {
    emoji: '🍼',
    description: 'baby bottle',
    category: 'Food & Drink',
    aliases: ['baby_bottle'],
    tags: ['milk']
  },
  {
    emoji: '🥛',
    description: 'glass of milk',
    category: 'Food & Drink',
    aliases: ['milk_glass'],
    tags: []
  },
  {
    emoji: '☕',
    description: 'hot beverage',
    category: 'Food & Drink',
    aliases: ['coffee'],
    tags: ['cafe', 'espresso']
  },
  {
    emoji: '🫖',
    description: 'teapot',
    category: 'Food & Drink',
    aliases: ['teapot'],
    tags: []
  },
  {
    emoji: '🍵',
    description: 'teacup without handle',
    category: 'Food & Drink',
    aliases: ['tea'],
    tags: ['green', 'breakfast']
  },
  {
    emoji: '🍶',
    description: 'sake',
    category: 'Food & Drink',
    aliases: ['sake'],
    tags: []
  },
  {
    emoji: '🍾',
    description: 'bottle with popping cork',
    category: 'Food & Drink',
    aliases: ['champagne'],
    tags: ['bottle', 'bubbly', 'celebration']
  },
  {
    emoji: '🍷',
    description: 'wine glass',
    category: 'Food & Drink',
    aliases: ['wine_glass'],
    tags: []
  },
  {
    emoji: '🍸',
    description: 'cocktail glass',
    category: 'Food & Drink',
    aliases: ['cocktail'],
    tags: ['drink']
  },
  {
    emoji: '🍹',
    description: 'tropical drink',
    category: 'Food & Drink',
    aliases: ['tropical_drink'],
    tags: ['summer', 'vacation']
  },
  {
    emoji: '🍺',
    description: 'beer mug',
    category: 'Food & Drink',
    aliases: ['beer'],
    tags: ['drink']
  },
  {
    emoji: '🍻',
    description: 'clinking beer mugs',
    category: 'Food & Drink',
    aliases: ['beers'],
    tags: ['drinks']
  },
  {
    emoji: '🥂',
    description: 'clinking glasses',
    category: 'Food & Drink',
    aliases: ['clinking_glasses'],
    tags: ['cheers', 'toast']
  },
  {
    emoji: '🥃',
    description: 'tumbler glass',
    category: 'Food & Drink',
    aliases: ['tumbler_glass'],
    tags: ['whisky']
  },
  {
    emoji: '🥤',
    description: 'cup with straw',
    category: 'Food & Drink',
    aliases: ['cup_with_straw'],
    tags: []
  },
  {
    emoji: '🧋',
    description: 'bubble tea',
    category: 'Food & Drink',
    aliases: ['bubble_tea'],
    tags: []
  },
  {
    emoji: '🧃',
    description: 'beverage box',
    category: 'Food & Drink',
    aliases: ['beverage_box'],
    tags: []
  },
  {
    emoji: '🧉',
    description: 'mate',
    category: 'Food & Drink',
    aliases: ['mate'],
    tags: []
  },
  {
    emoji: '🧊',
    description: 'ice',
    category: 'Food & Drink',
    aliases: ['ice_cube'],
    tags: []
  },
  {
    emoji: '🥢',
    description: 'chopsticks',
    category: 'Food & Drink',
    aliases: ['chopsticks'],
    tags: []
  },
  {
    emoji: '🍽️',
    description: 'fork and knife with plate',
    category: 'Food & Drink',
    aliases: ['plate_with_cutlery'],
    tags: ['dining', 'dinner']
  },
  {
    emoji: '🍴',
    description: 'fork and knife',
    category: 'Food & Drink',
    aliases: ['fork_and_knife'],
    tags: ['cutlery']
  },
  {
    emoji: '🥄',
    description: 'spoon',
    category: 'Food & Drink',
    aliases: ['spoon'],
    tags: []
  },
  {
    emoji: '🔪',
    description: 'kitchen knife',
    category: 'Food & Drink',
    aliases: ['hocho', 'knife'],
    tags: ['cut', 'chop']
  },
  {
    emoji: '🏺',
    description: 'amphora',
    category: 'Food & Drink',
    aliases: ['amphora'],
    tags: []
  },
  {
    emoji: '🌍',
    description: 'globe showing Europe-Africa',
    category: 'Travel & Places',
    aliases: ['earth_africa'],
    tags: ['globe', 'world', 'international']
  },
  {
    emoji: '🌎',
    description: 'globe showing Americas',
    category: 'Travel & Places',
    aliases: ['earth_americas'],
    tags: ['globe', 'world', 'international']
  },
  {
    emoji: '🌏',
    description: 'globe showing Asia-Australia',
    category: 'Travel & Places',
    aliases: ['earth_asia'],
    tags: ['globe', 'world', 'international']
  },
  {
    emoji: '🌐',
    description: 'globe with meridians',
    category: 'Travel & Places',
    aliases: ['globe_with_meridians'],
    tags: ['world', 'global', 'international']
  },
  {
    emoji: '🗺️',
    description: 'world map',
    category: 'Travel & Places',
    aliases: ['world_map'],
    tags: ['travel']
  },
  {
    emoji: '🗾',
    description: 'map of Japan',
    category: 'Travel & Places',
    aliases: ['japan'],
    tags: []
  },
  {
    emoji: '🧭',
    description: 'compass',
    category: 'Travel & Places',
    aliases: ['compass'],
    tags: []
  },
  {
    emoji: '🏔️',
    description: 'snow-capped mountain',
    category: 'Travel & Places',
    aliases: ['mountain_snow'],
    tags: []
  },
  {
    emoji: '⛰️',
    description: 'mountain',
    category: 'Travel & Places',
    aliases: ['mountain'],
    tags: []
  },
  {
    emoji: '🌋',
    description: 'volcano',
    category: 'Travel & Places',
    aliases: ['volcano'],
    tags: []
  },
  {
    emoji: '🗻',
    description: 'mount fuji',
    category: 'Travel & Places',
    aliases: ['mount_fuji'],
    tags: []
  },
  {
    emoji: '🏕️',
    description: 'camping',
    category: 'Travel & Places',
    aliases: ['camping'],
    tags: []
  },
  {
    emoji: '🏖️',
    description: 'beach with umbrella',
    category: 'Travel & Places',
    aliases: ['beach_umbrella'],
    tags: []
  },
  {
    emoji: '🏜️',
    description: 'desert',
    category: 'Travel & Places',
    aliases: ['desert'],
    tags: []
  },
  {
    emoji: '🏝️',
    description: 'desert island',
    category: 'Travel & Places',
    aliases: ['desert_island'],
    tags: []
  },
  {
    emoji: '🏞️',
    description: 'national park',
    category: 'Travel & Places',
    aliases: ['national_park'],
    tags: []
  },
  {
    emoji: '🏟️',
    description: 'stadium',
    category: 'Travel & Places',
    aliases: ['stadium'],
    tags: []
  },
  {
    emoji: '🏛️',
    description: 'classical building',
    category: 'Travel & Places',
    aliases: ['classical_building'],
    tags: []
  },
  {
    emoji: '🏗️',
    description: 'building construction',
    category: 'Travel & Places',
    aliases: ['building_construction'],
    tags: []
  },
  {
    emoji: '🧱',
    description: 'brick',
    category: 'Travel & Places',
    aliases: ['bricks'],
    tags: []
  },
  {
    emoji: '🪨',
    description: 'rock',
    category: 'Travel & Places',
    aliases: ['rock'],
    tags: []
  },
  {
    emoji: '🪵',
    description: 'wood',
    category: 'Travel & Places',
    aliases: ['wood'],
    tags: []
  },
  {
    emoji: '🛖',
    description: 'hut',
    category: 'Travel & Places',
    aliases: ['hut'],
    tags: []
  },
  {
    emoji: '🏘️',
    description: 'houses',
    category: 'Travel & Places',
    aliases: ['houses'],
    tags: []
  },
  {
    emoji: '🏚️',
    description: 'derelict house',
    category: 'Travel & Places',
    aliases: ['derelict_house'],
    tags: []
  },
  {
    emoji: '🏠',
    description: 'house',
    category: 'Travel & Places',
    aliases: ['house'],
    tags: []
  },
  {
    emoji: '🏡',
    description: 'house with garden',
    category: 'Travel & Places',
    aliases: ['house_with_garden'],
    tags: []
  },
  {
    emoji: '🏢',
    description: 'office building',
    category: 'Travel & Places',
    aliases: ['office'],
    tags: []
  },
  {
    emoji: '🏣',
    description: 'Japanese post office',
    category: 'Travel & Places',
    aliases: ['post_office'],
    tags: []
  },
  {
    emoji: '🏤',
    description: 'post office',
    category: 'Travel & Places',
    aliases: ['european_post_office'],
    tags: []
  },
  {
    emoji: '🏥',
    description: 'hospital',
    category: 'Travel & Places',
    aliases: ['hospital'],
    tags: []
  },
  {
    emoji: '🏦',
    description: 'bank',
    category: 'Travel & Places',
    aliases: ['bank'],
    tags: []
  },
  {
    emoji: '🏨',
    description: 'hotel',
    category: 'Travel & Places',
    aliases: ['hotel'],
    tags: []
  },
  {
    emoji: '🏩',
    description: 'love hotel',
    category: 'Travel & Places',
    aliases: ['love_hotel'],
    tags: []
  },
  {
    emoji: '🏪',
    description: 'convenience store',
    category: 'Travel & Places',
    aliases: ['convenience_store'],
    tags: []
  },
  {
    emoji: '🏫',
    description: 'school',
    category: 'Travel & Places',
    aliases: ['school'],
    tags: []
  },
  {
    emoji: '🏬',
    description: 'department store',
    category: 'Travel & Places',
    aliases: ['department_store'],
    tags: []
  },
  {
    emoji: '🏭',
    description: 'factory',
    category: 'Travel & Places',
    aliases: ['factory'],
    tags: []
  },
  {
    emoji: '🏯',
    description: 'Japanese castle',
    category: 'Travel & Places',
    aliases: ['japanese_castle'],
    tags: []
  },
  {
    emoji: '🏰',
    description: 'castle',
    category: 'Travel & Places',
    aliases: ['european_castle'],
    tags: []
  },
  {
    emoji: '💒',
    description: 'wedding',
    category: 'Travel & Places',
    aliases: ['wedding'],
    tags: ['marriage']
  },
  {
    emoji: '🗼',
    description: 'Tokyo tower',
    category: 'Travel & Places',
    aliases: ['tokyo_tower'],
    tags: []
  },
  {
    emoji: '🗽',
    description: 'Statue of Liberty',
    category: 'Travel & Places',
    aliases: ['statue_of_liberty'],
    tags: []
  },
  {
    emoji: '⛪',
    description: 'church',
    category: 'Travel & Places',
    aliases: ['church'],
    tags: []
  },
  {
    emoji: '🕌',
    description: 'mosque',
    category: 'Travel & Places',
    aliases: ['mosque'],
    tags: []
  },
  {
    emoji: '🛕',
    description: 'hindu temple',
    category: 'Travel & Places',
    aliases: ['hindu_temple'],
    tags: []
  },
  {
    emoji: '🕍',
    description: 'synagogue',
    category: 'Travel & Places',
    aliases: ['synagogue'],
    tags: []
  },
  {
    emoji: '⛩️',
    description: 'shinto shrine',
    category: 'Travel & Places',
    aliases: ['shinto_shrine'],
    tags: []
  },
  {
    emoji: '🕋',
    description: 'kaaba',
    category: 'Travel & Places',
    aliases: ['kaaba'],
    tags: []
  },
  {
    emoji: '⛲',
    description: 'fountain',
    category: 'Travel & Places',
    aliases: ['fountain'],
    tags: []
  },
  {
    emoji: '⛺',
    description: 'tent',
    category: 'Travel & Places',
    aliases: ['tent'],
    tags: ['camping']
  },
  {
    emoji: '🌁',
    description: 'foggy',
    category: 'Travel & Places',
    aliases: ['foggy'],
    tags: ['karl']
  },
  {
    emoji: '🌃',
    description: 'night with stars',
    category: 'Travel & Places',
    aliases: ['night_with_stars'],
    tags: []
  },
  {
    emoji: '🏙️',
    description: 'cityscape',
    category: 'Travel & Places',
    aliases: ['cityscape'],
    tags: ['skyline']
  },
  {
    emoji: '🌄',
    description: 'sunrise over mountains',
    category: 'Travel & Places',
    aliases: ['sunrise_over_mountains'],
    tags: []
  },
  {
    emoji: '🌅',
    description: 'sunrise',
    category: 'Travel & Places',
    aliases: ['sunrise'],
    tags: []
  },
  {
    emoji: '🌆',
    description: 'cityscape at dusk',
    category: 'Travel & Places',
    aliases: ['city_sunset'],
    tags: []
  },
  {
    emoji: '🌇',
    description: 'sunset',
    category: 'Travel & Places',
    aliases: ['city_sunrise'],
    tags: []
  },
  {
    emoji: '🌉',
    description: 'bridge at night',
    category: 'Travel & Places',
    aliases: ['bridge_at_night'],
    tags: []
  },
  {
    emoji: '♨️',
    description: 'hot springs',
    category: 'Travel & Places',
    aliases: ['hotsprings'],
    tags: []
  },
  {
    emoji: '🎠',
    description: 'carousel horse',
    category: 'Travel & Places',
    aliases: ['carousel_horse'],
    tags: []
  },
  {
    emoji: '🎡',
    description: 'ferris wheel',
    category: 'Travel & Places',
    aliases: ['ferris_wheel'],
    tags: []
  },
  {
    emoji: '🎢',
    description: 'roller coaster',
    category: 'Travel & Places',
    aliases: ['roller_coaster'],
    tags: []
  },
  {
    emoji: '💈',
    description: 'barber pole',
    category: 'Travel & Places',
    aliases: ['barber'],
    tags: []
  },
  {
    emoji: '🎪',
    description: 'circus tent',
    category: 'Travel & Places',
    aliases: ['circus_tent'],
    tags: []
  },
  {
    emoji: '🚂',
    description: 'locomotive',
    category: 'Travel & Places',
    aliases: ['steam_locomotive'],
    tags: ['train']
  },
  {
    emoji: '🚃',
    description: 'railway car',
    category: 'Travel & Places',
    aliases: ['railway_car'],
    tags: []
  },
  {
    emoji: '🚄',
    description: 'high-speed train',
    category: 'Travel & Places',
    aliases: ['bullettrain_side'],
    tags: ['train']
  },
  {
    emoji: '🚅',
    description: 'bullet train',
    category: 'Travel & Places',
    aliases: ['bullettrain_front'],
    tags: ['train']
  },
  {
    emoji: '🚆',
    description: 'train',
    category: 'Travel & Places',
    aliases: ['train2'],
    tags: []
  },
  {
    emoji: '🚇',
    description: 'metro',
    category: 'Travel & Places',
    aliases: ['metro'],
    tags: []
  },
  {
    emoji: '🚈',
    description: 'light rail',
    category: 'Travel & Places',
    aliases: ['light_rail'],
    tags: []
  },
  {
    emoji: '🚉',
    description: 'station',
    category: 'Travel & Places',
    aliases: ['station'],
    tags: []
  },
  {
    emoji: '🚊',
    description: 'tram',
    category: 'Travel & Places',
    aliases: ['tram'],
    tags: []
  },
  {
    emoji: '🚝',
    description: 'monorail',
    category: 'Travel & Places',
    aliases: ['monorail'],
    tags: []
  },
  {
    emoji: '🚞',
    description: 'mountain railway',
    category: 'Travel & Places',
    aliases: ['mountain_railway'],
    tags: []
  },
  {
    emoji: '🚋',
    description: 'tram car',
    category: 'Travel & Places',
    aliases: ['train'],
    tags: []
  },
  {
    emoji: '🚌',
    description: 'bus',
    category: 'Travel & Places',
    aliases: ['bus'],
    tags: []
  },
  {
    emoji: '🚍',
    description: 'oncoming bus',
    category: 'Travel & Places',
    aliases: ['oncoming_bus'],
    tags: []
  },
  {
    emoji: '🚎',
    description: 'trolleybus',
    category: 'Travel & Places',
    aliases: ['trolleybus'],
    tags: []
  },
  {
    emoji: '🚐',
    description: 'minibus',
    category: 'Travel & Places',
    aliases: ['minibus'],
    tags: []
  },
  {
    emoji: '🚑',
    description: 'ambulance',
    category: 'Travel & Places',
    aliases: ['ambulance'],
    tags: []
  },
  {
    emoji: '🚒',
    description: 'fire engine',
    category: 'Travel & Places',
    aliases: ['fire_engine'],
    tags: []
  },
  {
    emoji: '🚓',
    description: 'police car',
    category: 'Travel & Places',
    aliases: ['police_car'],
    tags: []
  },
  {
    emoji: '🚔',
    description: 'oncoming police car',
    category: 'Travel & Places',
    aliases: ['oncoming_police_car'],
    tags: []
  },
  {
    emoji: '🚕',
    description: 'taxi',
    category: 'Travel & Places',
    aliases: ['taxi'],
    tags: []
  },
  {
    emoji: '🚖',
    description: 'oncoming taxi',
    category: 'Travel & Places',
    aliases: ['oncoming_taxi'],
    tags: []
  },
  {
    emoji: '🚗',
    description: 'automobile',
    category: 'Travel & Places',
    aliases: ['car', 'red_car'],
    tags: []
  },
  {
    emoji: '🚘',
    description: 'oncoming automobile',
    category: 'Travel & Places',
    aliases: ['oncoming_automobile'],
    tags: []
  },
  {
    emoji: '🚙',
    description: 'sport utility vehicle',
    category: 'Travel & Places',
    aliases: ['blue_car'],
    tags: []
  },
  {
    emoji: '🛻',
    description: 'pickup truck',
    category: 'Travel & Places',
    aliases: ['pickup_truck'],
    tags: []
  },
  {
    emoji: '🚚',
    description: 'delivery truck',
    category: 'Travel & Places',
    aliases: ['truck'],
    tags: []
  },
  {
    emoji: '🚛',
    description: 'articulated lorry',
    category: 'Travel & Places',
    aliases: ['articulated_lorry'],
    tags: []
  },
  {
    emoji: '🚜',
    description: 'tractor',
    category: 'Travel & Places',
    aliases: ['tractor'],
    tags: []
  },
  {
    emoji: '🏎️',
    description: 'racing car',
    category: 'Travel & Places',
    aliases: ['racing_car'],
    tags: []
  },
  {
    emoji: '🏍️',
    description: 'motorcycle',
    category: 'Travel & Places',
    aliases: ['motorcycle'],
    tags: []
  },
  {
    emoji: '🛵',
    description: 'motor scooter',
    category: 'Travel & Places',
    aliases: ['motor_scooter'],
    tags: []
  },
  {
    emoji: '🦽',
    description: 'manual wheelchair',
    category: 'Travel & Places',
    aliases: ['manual_wheelchair'],
    tags: []
  },
  {
    emoji: '🦼',
    description: 'motorized wheelchair',
    category: 'Travel & Places',
    aliases: ['motorized_wheelchair'],
    tags: []
  },
  {
    emoji: '🛺',
    description: 'auto rickshaw',
    category: 'Travel & Places',
    aliases: ['auto_rickshaw'],
    tags: []
  },
  {
    emoji: '🚲',
    description: 'bicycle',
    category: 'Travel & Places',
    aliases: ['bike'],
    tags: ['bicycle']
  },
  {
    emoji: '🛴',
    description: 'kick scooter',
    category: 'Travel & Places',
    aliases: ['kick_scooter'],
    tags: []
  },
  {
    emoji: '🛹',
    description: 'skateboard',
    category: 'Travel & Places',
    aliases: ['skateboard'],
    tags: []
  },
  {
    emoji: '🛼',
    description: 'roller skate',
    category: 'Travel & Places',
    aliases: ['roller_skate'],
    tags: []
  },
  {
    emoji: '🚏',
    description: 'bus stop',
    category: 'Travel & Places',
    aliases: ['busstop'],
    tags: []
  },
  {
    emoji: '🛣️',
    description: 'motorway',
    category: 'Travel & Places',
    aliases: ['motorway'],
    tags: []
  },
  {
    emoji: '🛤️',
    description: 'railway track',
    category: 'Travel & Places',
    aliases: ['railway_track'],
    tags: []
  },
  {
    emoji: '🛢️',
    description: 'oil drum',
    category: 'Travel & Places',
    aliases: ['oil_drum'],
    tags: []
  },
  {
    emoji: '⛽',
    description: 'fuel pump',
    category: 'Travel & Places',
    aliases: ['fuelpump'],
    tags: []
  },
  {
    emoji: '🚨',
    description: 'police car light',
    category: 'Travel & Places',
    aliases: ['rotating_light'],
    tags: ['911', 'emergency']
  },
  {
    emoji: '🚥',
    description: 'horizontal traffic light',
    category: 'Travel & Places',
    aliases: ['traffic_light'],
    tags: []
  },
  {
    emoji: '🚦',
    description: 'vertical traffic light',
    category: 'Travel & Places',
    aliases: ['vertical_traffic_light'],
    tags: ['semaphore']
  },
  {
    emoji: '🛑',
    description: 'stop sign',
    category: 'Travel & Places',
    aliases: ['stop_sign'],
    tags: []
  },
  {
    emoji: '🚧',
    description: 'construction',
    category: 'Travel & Places',
    aliases: ['construction'],
    tags: ['wip']
  },
  {
    emoji: '⚓',
    description: 'anchor',
    category: 'Travel & Places',
    aliases: ['anchor'],
    tags: ['ship']
  },
  {
    emoji: '⛵',
    description: 'sailboat',
    category: 'Travel & Places',
    aliases: ['boat', 'sailboat'],
    tags: []
  },
  {
    emoji: '🛶',
    description: 'canoe',
    category: 'Travel & Places',
    aliases: ['canoe'],
    tags: []
  },
  {
    emoji: '🚤',
    description: 'speedboat',
    category: 'Travel & Places',
    aliases: ['speedboat'],
    tags: ['ship']
  },
  {
    emoji: '🛳️',
    description: 'passenger ship',
    category: 'Travel & Places',
    aliases: ['passenger_ship'],
    tags: ['cruise']
  },
  {
    emoji: '⛴️',
    description: 'ferry',
    category: 'Travel & Places',
    aliases: ['ferry'],
    tags: []
  },
  {
    emoji: '🛥️',
    description: 'motor boat',
    category: 'Travel & Places',
    aliases: ['motor_boat'],
    tags: []
  },
  {
    emoji: '🚢',
    description: 'ship',
    category: 'Travel & Places',
    aliases: ['ship'],
    tags: []
  },
  {
    emoji: '✈️',
    description: 'airplane',
    category: 'Travel & Places',
    aliases: ['airplane'],
    tags: ['flight']
  },
  {
    emoji: '🛩️',
    description: 'small airplane',
    category: 'Travel & Places',
    aliases: ['small_airplane'],
    tags: ['flight']
  },
  {
    emoji: '🛫',
    description: 'airplane departure',
    category: 'Travel & Places',
    aliases: ['flight_departure'],
    tags: []
  },
  {
    emoji: '🛬',
    description: 'airplane arrival',
    category: 'Travel & Places',
    aliases: ['flight_arrival'],
    tags: []
  },
  {
    emoji: '🪂',
    description: 'parachute',
    category: 'Travel & Places',
    aliases: ['parachute'],
    tags: []
  },
  {
    emoji: '💺',
    description: 'seat',
    category: 'Travel & Places',
    aliases: ['seat'],
    tags: []
  },
  {
    emoji: '🚁',
    description: 'helicopter',
    category: 'Travel & Places',
    aliases: ['helicopter'],
    tags: []
  },
  {
    emoji: '🚟',
    description: 'suspension railway',
    category: 'Travel & Places',
    aliases: ['suspension_railway'],
    tags: []
  },
  {
    emoji: '🚠',
    description: 'mountain cableway',
    category: 'Travel & Places',
    aliases: ['mountain_cableway'],
    tags: []
  },
  {
    emoji: '🚡',
    description: 'aerial tramway',
    category: 'Travel & Places',
    aliases: ['aerial_tramway'],
    tags: []
  },
  {
    emoji: '🛰️',
    description: 'satellite',
    category: 'Travel & Places',
    aliases: ['artificial_satellite'],
    tags: ['orbit', 'space']
  },
  {
    emoji: '🚀',
    description: 'rocket',
    category: 'Travel & Places',
    aliases: ['rocket'],
    tags: ['ship', 'launch']
  },
  {
    emoji: '🛸',
    description: 'flying saucer',
    category: 'Travel & Places',
    aliases: ['flying_saucer'],
    tags: ['ufo']
  },
  {
    emoji: '🛎️',
    description: 'bellhop bell',
    category: 'Travel & Places',
    aliases: ['bellhop_bell'],
    tags: []
  },
  {
    emoji: '🧳',
    description: 'luggage',
    category: 'Travel & Places',
    aliases: ['luggage'],
    tags: []
  },
  {
    emoji: '⌛',
    description: 'hourglass done',
    category: 'Travel & Places',
    aliases: ['hourglass'],
    tags: ['time']
  },
  {
    emoji: '⏳',
    description: 'hourglass not done',
    category: 'Travel & Places',
    aliases: ['hourglass_flowing_sand'],
    tags: ['time']
  },
  {
    emoji: '⌚',
    description: 'watch',
    category: 'Travel & Places',
    aliases: ['watch'],
    tags: ['time']
  },
  {
    emoji: '⏰',
    description: 'alarm clock',
    category: 'Travel & Places',
    aliases: ['alarm_clock'],
    tags: ['morning']
  },
  {
    emoji: '⏱️',
    description: 'stopwatch',
    category: 'Travel & Places',
    aliases: ['stopwatch'],
    tags: []
  },
  {
    emoji: '⏲️',
    description: 'timer clock',
    category: 'Travel & Places',
    aliases: ['timer_clock'],
    tags: []
  },
  {
    emoji: '🕰️',
    description: 'mantelpiece clock',
    category: 'Travel & Places',
    aliases: ['mantelpiece_clock'],
    tags: []
  },
  {
    emoji: '🕛',
    description: 'twelve o’clock',
    category: 'Travel & Places',
    aliases: ['clock12'],
    tags: []
  },
  {
    emoji: '🕧',
    description: 'twelve-thirty',
    category: 'Travel & Places',
    aliases: ['clock1230'],
    tags: []
  },
  {
    emoji: '🕐',
    description: 'one o’clock',
    category: 'Travel & Places',
    aliases: ['clock1'],
    tags: []
  },
  {
    emoji: '🕜',
    description: 'one-thirty',
    category: 'Travel & Places',
    aliases: ['clock130'],
    tags: []
  },
  {
    emoji: '🕑',
    description: 'two o’clock',
    category: 'Travel & Places',
    aliases: ['clock2'],
    tags: []
  },
  {
    emoji: '🕝',
    description: 'two-thirty',
    category: 'Travel & Places',
    aliases: ['clock230'],
    tags: []
  },
  {
    emoji: '🕒',
    description: 'three o’clock',
    category: 'Travel & Places',
    aliases: ['clock3'],
    tags: []
  },
  {
    emoji: '🕞',
    description: 'three-thirty',
    category: 'Travel & Places',
    aliases: ['clock330'],
    tags: []
  },
  {
    emoji: '🕓',
    description: 'four o’clock',
    category: 'Travel & Places',
    aliases: ['clock4'],
    tags: []
  },
  {
    emoji: '🕟',
    description: 'four-thirty',
    category: 'Travel & Places',
    aliases: ['clock430'],
    tags: []
  },
  {
    emoji: '🕔',
    description: 'five o’clock',
    category: 'Travel & Places',
    aliases: ['clock5'],
    tags: []
  },
  {
    emoji: '🕠',
    description: 'five-thirty',
    category: 'Travel & Places',
    aliases: ['clock530'],
    tags: []
  },
  {
    emoji: '🕕',
    description: 'six o’clock',
    category: 'Travel & Places',
    aliases: ['clock6'],
    tags: []
  },
  {
    emoji: '🕡',
    description: 'six-thirty',
    category: 'Travel & Places',
    aliases: ['clock630'],
    tags: []
  },
  {
    emoji: '🕖',
    description: 'seven o’clock',
    category: 'Travel & Places',
    aliases: ['clock7'],
    tags: []
  },
  {
    emoji: '🕢',
    description: 'seven-thirty',
    category: 'Travel & Places',
    aliases: ['clock730'],
    tags: []
  },
  {
    emoji: '🕗',
    description: 'eight o’clock',
    category: 'Travel & Places',
    aliases: ['clock8'],
    tags: []
  },
  {
    emoji: '🕣',
    description: 'eight-thirty',
    category: 'Travel & Places',
    aliases: ['clock830'],
    tags: []
  },
  {
    emoji: '🕘',
    description: 'nine o’clock',
    category: 'Travel & Places',
    aliases: ['clock9'],
    tags: []
  },
  {
    emoji: '🕤',
    description: 'nine-thirty',
    category: 'Travel & Places',
    aliases: ['clock930'],
    tags: []
  },
  {
    emoji: '🕙',
    description: 'ten o’clock',
    category: 'Travel & Places',
    aliases: ['clock10'],
    tags: []
  },
  {
    emoji: '🕥',
    description: 'ten-thirty',
    category: 'Travel & Places',
    aliases: ['clock1030'],
    tags: []
  },
  {
    emoji: '🕚',
    description: 'eleven o’clock',
    category: 'Travel & Places',
    aliases: ['clock11'],
    tags: []
  },
  {
    emoji: '🕦',
    description: 'eleven-thirty',
    category: 'Travel & Places',
    aliases: ['clock1130'],
    tags: []
  },
  {
    emoji: '🌑',
    description: 'new moon',
    category: 'Travel & Places',
    aliases: ['new_moon'],
    tags: []
  },
  {
    emoji: '🌒',
    description: 'waxing crescent moon',
    category: 'Travel & Places',
    aliases: ['waxing_crescent_moon'],
    tags: []
  },
  {
    emoji: '🌓',
    description: 'first quarter moon',
    category: 'Travel & Places',
    aliases: ['first_quarter_moon'],
    tags: []
  },
  {
    emoji: '🌔',
    description: 'waxing gibbous moon',
    category: 'Travel & Places',
    aliases: ['moon', 'waxing_gibbous_moon'],
    tags: []
  },
  {
    emoji: '🌕',
    description: 'full moon',
    category: 'Travel & Places',
    aliases: ['full_moon'],
    tags: []
  },
  {
    emoji: '🌖',
    description: 'waning gibbous moon',
    category: 'Travel & Places',
    aliases: ['waning_gibbous_moon'],
    tags: []
  },
  {
    emoji: '🌗',
    description: 'last quarter moon',
    category: 'Travel & Places',
    aliases: ['last_quarter_moon'],
    tags: []
  },
  {
    emoji: '🌘',
    description: 'waning crescent moon',
    category: 'Travel & Places',
    aliases: ['waning_crescent_moon'],
    tags: []
  },
  {
    emoji: '🌙',
    description: 'crescent moon',
    category: 'Travel & Places',
    aliases: ['crescent_moon'],
    tags: ['night']
  },
  {
    emoji: '🌚',
    description: 'new moon face',
    category: 'Travel & Places',
    aliases: ['new_moon_with_face'],
    tags: []
  },
  {
    emoji: '🌛',
    description: 'first quarter moon face',
    category: 'Travel & Places',
    aliases: ['first_quarter_moon_with_face'],
    tags: []
  },
  {
    emoji: '🌜',
    description: 'last quarter moon face',
    category: 'Travel & Places',
    aliases: ['last_quarter_moon_with_face'],
    tags: []
  },
  {
    emoji: '🌡️',
    description: 'thermometer',
    category: 'Travel & Places',
    aliases: ['thermometer'],
    tags: []
  },
  {
    emoji: '☀️',
    description: 'sun',
    category: 'Travel & Places',
    aliases: ['sunny'],
    tags: ['weather']
  },
  {
    emoji: '🌝',
    description: 'full moon face',
    category: 'Travel & Places',
    aliases: ['full_moon_with_face'],
    tags: []
  },
  {
    emoji: '🌞',
    description: 'sun with face',
    category: 'Travel & Places',
    aliases: ['sun_with_face'],
    tags: ['summer']
  },
  {
    emoji: '🪐',
    description: 'ringed planet',
    category: 'Travel & Places',
    aliases: ['ringed_planet'],
    tags: []
  },
  {
    emoji: '⭐',
    description: 'star',
    category: 'Travel & Places',
    aliases: ['star'],
    tags: []
  },
  {
    emoji: '🌟',
    description: 'glowing star',
    category: 'Travel & Places',
    aliases: ['star2'],
    tags: []
  },
  {
    emoji: '🌠',
    description: 'shooting star',
    category: 'Travel & Places',
    aliases: ['stars'],
    tags: []
  },
  {
    emoji: '🌌',
    description: 'milky way',
    category: 'Travel & Places',
    aliases: ['milky_way'],
    tags: []
  },
  {
    emoji: '☁️',
    description: 'cloud',
    category: 'Travel & Places',
    aliases: ['cloud'],
    tags: []
  },
  {
    emoji: '⛅',
    description: 'sun behind cloud',
    category: 'Travel & Places',
    aliases: ['partly_sunny'],
    tags: ['weather', 'cloud']
  },
  {
    emoji: '⛈️',
    description: 'cloud with lightning and rain',
    category: 'Travel & Places',
    aliases: ['cloud_with_lightning_and_rain'],
    tags: []
  },
  {
    emoji: '🌤️',
    description: 'sun behind small cloud',
    category: 'Travel & Places',
    aliases: ['sun_behind_small_cloud'],
    tags: []
  },
  {
    emoji: '🌥️',
    description: 'sun behind large cloud',
    category: 'Travel & Places',
    aliases: ['sun_behind_large_cloud'],
    tags: []
  },
  {
    emoji: '🌦️',
    description: 'sun behind rain cloud',
    category: 'Travel & Places',
    aliases: ['sun_behind_rain_cloud'],
    tags: []
  },
  {
    emoji: '🌧️',
    description: 'cloud with rain',
    category: 'Travel & Places',
    aliases: ['cloud_with_rain'],
    tags: []
  },
  {
    emoji: '🌨️',
    description: 'cloud with snow',
    category: 'Travel & Places',
    aliases: ['cloud_with_snow'],
    tags: []
  },
  {
    emoji: '🌩️',
    description: 'cloud with lightning',
    category: 'Travel & Places',
    aliases: ['cloud_with_lightning'],
    tags: []
  },
  {
    emoji: '🌪️',
    description: 'tornado',
    category: 'Travel & Places',
    aliases: ['tornado'],
    tags: []
  },
  {
    emoji: '🌫️',
    description: 'fog',
    category: 'Travel & Places',
    aliases: ['fog'],
    tags: []
  },
  {
    emoji: '🌬️',
    description: 'wind face',
    category: 'Travel & Places',
    aliases: ['wind_face'],
    tags: []
  },
  {
    emoji: '🌀',
    description: 'cyclone',
    category: 'Travel & Places',
    aliases: ['cyclone'],
    tags: ['swirl']
  },
  {
    emoji: '🌈',
    description: 'rainbow',
    category: 'Travel & Places',
    aliases: ['rainbow'],
    tags: []
  },
  {
    emoji: '🌂',
    description: 'closed umbrella',
    category: 'Travel & Places',
    aliases: ['closed_umbrella'],
    tags: ['weather', 'rain']
  },
  {
    emoji: '☂️',
    description: 'umbrella',
    category: 'Travel & Places',
    aliases: ['open_umbrella'],
    tags: []
  },
  {
    emoji: '☔',
    description: 'umbrella with rain drops',
    category: 'Travel & Places',
    aliases: ['umbrella'],
    tags: ['rain', 'weather']
  },
  {
    emoji: '⛱️',
    description: 'umbrella on ground',
    category: 'Travel & Places',
    aliases: ['parasol_on_ground'],
    tags: ['beach_umbrella']
  },
  {
    emoji: '⚡',
    description: 'high voltage',
    category: 'Travel & Places',
    aliases: ['zap'],
    tags: ['lightning', 'thunder']
  },
  {
    emoji: '❄️',
    description: 'snowflake',
    category: 'Travel & Places',
    aliases: ['snowflake'],
    tags: ['winter', 'cold', 'weather']
  },
  {
    emoji: '☃️',
    description: 'snowman',
    category: 'Travel & Places',
    aliases: ['snowman_with_snow'],
    tags: ['winter', 'christmas']
  },
  {
    emoji: '⛄',
    description: 'snowman without snow',
    category: 'Travel & Places',
    aliases: ['snowman'],
    tags: ['winter']
  },
  {
    emoji: '☄️',
    description: 'comet',
    category: 'Travel & Places',
    aliases: ['comet'],
    tags: []
  },
  {
    emoji: '🔥',
    description: 'fire',
    category: 'Travel & Places',
    aliases: ['fire'],
    tags: ['burn']
  },
  {
    emoji: '💧',
    description: 'droplet',
    category: 'Travel & Places',
    aliases: ['droplet'],
    tags: ['water']
  },
  {
    emoji: '🌊',
    description: 'water wave',
    category: 'Travel & Places',
    aliases: ['ocean'],
    tags: ['sea']
  },
  {
    emoji: '🎃',
    description: 'jack-o-lantern',
    category: 'Activities',
    aliases: ['jack_o_lantern'],
    tags: ['halloween']
  },
  {
    emoji: '🎄',
    description: 'Christmas tree',
    category: 'Activities',
    aliases: ['christmas_tree'],
    tags: []
  },
  {
    emoji: '🎆',
    description: 'fireworks',
    category: 'Activities',
    aliases: ['fireworks'],
    tags: ['festival', 'celebration']
  },
  {
    emoji: '🎇',
    description: 'sparkler',
    category: 'Activities',
    aliases: ['sparkler'],
    tags: []
  },
  {
    emoji: '🧨',
    description: 'firecracker',
    category: 'Activities',
    aliases: ['firecracker'],
    tags: []
  },
  {
    emoji: '✨',
    description: 'sparkles',
    category: 'Activities',
    aliases: ['sparkles'],
    tags: ['shiny']
  },
  {
    emoji: '🎈',
    description: 'balloon',
    category: 'Activities',
    aliases: ['balloon'],
    tags: ['party', 'birthday']
  },
  {
    emoji: '🎉',
    description: 'party popper',
    category: 'Activities',
    aliases: ['tada'],
    tags: ['hooray', 'party']
  },
  {
    emoji: '🎊',
    description: 'confetti ball',
    category: 'Activities',
    aliases: ['confetti_ball'],
    tags: []
  },
  {
    emoji: '🎋',
    description: 'tanabata tree',
    category: 'Activities',
    aliases: ['tanabata_tree'],
    tags: []
  },
  {
    emoji: '🎍',
    description: 'pine decoration',
    category: 'Activities',
    aliases: ['bamboo'],
    tags: []
  },
  {
    emoji: '🎎',
    description: 'Japanese dolls',
    category: 'Activities',
    aliases: ['dolls'],
    tags: []
  },
  {
    emoji: '🎏',
    description: 'carp streamer',
    category: 'Activities',
    aliases: ['flags'],
    tags: []
  },
  {
    emoji: '🎐',
    description: 'wind chime',
    category: 'Activities',
    aliases: ['wind_chime'],
    tags: []
  },
  {
    emoji: '🎑',
    description: 'moon viewing ceremony',
    category: 'Activities',
    aliases: ['rice_scene'],
    tags: []
  },
  {
    emoji: '🧧',
    description: 'red envelope',
    category: 'Activities',
    aliases: ['red_envelope'],
    tags: []
  },
  {
    emoji: '🎀',
    description: 'ribbon',
    category: 'Activities',
    aliases: ['ribbon'],
    tags: []
  },
  {
    emoji: '🎁',
    description: 'wrapped gift',
    category: 'Activities',
    aliases: ['gift'],
    tags: ['present', 'birthday', 'christmas']
  },
  {
    emoji: '🎗️',
    description: 'reminder ribbon',
    category: 'Activities',
    aliases: ['reminder_ribbon'],
    tags: []
  },
  {
    emoji: '🎟️',
    description: 'admission tickets',
    category: 'Activities',
    aliases: ['tickets'],
    tags: []
  },
  {
    emoji: '🎫',
    description: 'ticket',
    category: 'Activities',
    aliases: ['ticket'],
    tags: []
  },
  {
    emoji: '🎖️',
    description: 'military medal',
    category: 'Activities',
    aliases: ['medal_military'],
    tags: []
  },
  {
    emoji: '🏆',
    description: 'trophy',
    category: 'Activities',
    aliases: ['trophy'],
    tags: ['award', 'contest', 'winner']
  },
  {
    emoji: '🏅',
    description: 'sports medal',
    category: 'Activities',
    aliases: ['medal_sports'],
    tags: ['gold', 'winner']
  },
  {
    emoji: '🥇',
    description: '1st place medal',
    category: 'Activities',
    aliases: ['1st_place_medal'],
    tags: ['gold']
  },
  {
    emoji: '🥈',
    description: '2nd place medal',
    category: 'Activities',
    aliases: ['2nd_place_medal'],
    tags: ['silver']
  },
  {
    emoji: '🥉',
    description: '3rd place medal',
    category: 'Activities',
    aliases: ['3rd_place_medal'],
    tags: ['bronze']
  },
  {
    emoji: '⚽',
    description: 'soccer ball',
    category: 'Activities',
    aliases: ['soccer'],
    tags: ['sports']
  },
  {
    emoji: '⚾',
    description: 'baseball',
    category: 'Activities',
    aliases: ['baseball'],
    tags: ['sports']
  },
  {
    emoji: '🥎',
    description: 'softball',
    category: 'Activities',
    aliases: ['softball'],
    tags: []
  },
  {
    emoji: '🏀',
    description: 'basketball',
    category: 'Activities',
    aliases: ['basketball'],
    tags: ['sports']
  },
  {
    emoji: '🏐',
    description: 'volleyball',
    category: 'Activities',
    aliases: ['volleyball'],
    tags: []
  },
  {
    emoji: '🏈',
    description: 'american football',
    category: 'Activities',
    aliases: ['football'],
    tags: ['sports']
  },
  {
    emoji: '🏉',
    description: 'rugby football',
    category: 'Activities',
    aliases: ['rugby_football'],
    tags: []
  },
  {
    emoji: '🎾',
    description: 'tennis',
    category: 'Activities',
    aliases: ['tennis'],
    tags: ['sports']
  },
  {
    emoji: '🥏',
    description: 'flying disc',
    category: 'Activities',
    aliases: ['flying_disc'],
    tags: []
  },
  {
    emoji: '🎳',
    description: 'bowling',
    category: 'Activities',
    aliases: ['bowling'],
    tags: []
  },
  {
    emoji: '🏏',
    description: 'cricket game',
    category: 'Activities',
    aliases: ['cricket_game'],
    tags: []
  },
  {
    emoji: '🏑',
    description: 'field hockey',
    category: 'Activities',
    aliases: ['field_hockey'],
    tags: []
  },
  {
    emoji: '🏒',
    description: 'ice hockey',
    category: 'Activities',
    aliases: ['ice_hockey'],
    tags: []
  },
  {
    emoji: '🥍',
    description: 'lacrosse',
    category: 'Activities',
    aliases: ['lacrosse'],
    tags: []
  },
  {
    emoji: '🏓',
    description: 'ping pong',
    category: 'Activities',
    aliases: ['ping_pong'],
    tags: []
  },
  {
    emoji: '🏸',
    description: 'badminton',
    category: 'Activities',
    aliases: ['badminton'],
    tags: []
  },
  {
    emoji: '🥊',
    description: 'boxing glove',
    category: 'Activities',
    aliases: ['boxing_glove'],
    tags: []
  },
  {
    emoji: '🥋',
    description: 'martial arts uniform',
    category: 'Activities',
    aliases: ['martial_arts_uniform'],
    tags: []
  },
  {
    emoji: '🥅',
    description: 'goal net',
    category: 'Activities',
    aliases: ['goal_net'],
    tags: []
  },
  {
    emoji: '⛳',
    description: 'flag in hole',
    category: 'Activities',
    aliases: ['golf'],
    tags: []
  },
  {
    emoji: '⛸️',
    description: 'ice skate',
    category: 'Activities',
    aliases: ['ice_skate'],
    tags: ['skating']
  },
  {
    emoji: '🎣',
    description: 'fishing pole',
    category: 'Activities',
    aliases: ['fishing_pole_and_fish'],
    tags: []
  },
  {
    emoji: '🤿',
    description: 'diving mask',
    category: 'Activities',
    aliases: ['diving_mask'],
    tags: []
  },
  {
    emoji: '🎽',
    description: 'running shirt',
    category: 'Activities',
    aliases: ['running_shirt_with_sash'],
    tags: ['marathon']
  },
  {
    emoji: '🎿',
    description: 'skis',
    category: 'Activities',
    aliases: ['ski'],
    tags: []
  },
  {
    emoji: '🛷',
    description: 'sled',
    category: 'Activities',
    aliases: ['sled'],
    tags: []
  },
  {
    emoji: '🥌',
    description: 'curling stone',
    category: 'Activities',
    aliases: ['curling_stone'],
    tags: []
  },
  {
    emoji: '🎯',
    description: 'bullseye',
    category: 'Activities',
    aliases: ['dart'],
    tags: ['target']
  },
  {
    emoji: '🪀',
    description: 'yo-yo',
    category: 'Activities',
    aliases: ['yo_yo'],
    tags: []
  },
  {
    emoji: '🪁',
    description: 'kite',
    category: 'Activities',
    aliases: ['kite'],
    tags: []
  },
  {
    emoji: '🎱',
    description: 'pool 8 ball',
    category: 'Activities',
    aliases: ['8ball'],
    tags: ['pool', 'billiards']
  },
  {
    emoji: '🔮',
    description: 'crystal ball',
    category: 'Activities',
    aliases: ['crystal_ball'],
    tags: ['fortune']
  },
  {
    emoji: '🪄',
    description: 'magic wand',
    category: 'Activities',
    aliases: ['magic_wand'],
    tags: []
  },
  {
    emoji: '🧿',
    description: 'nazar amulet',
    category: 'Activities',
    aliases: ['nazar_amulet'],
    tags: []
  },
  {
    emoji: '🎮',
    description: 'video game',
    category: 'Activities',
    aliases: ['video_game'],
    tags: ['play', 'controller', 'console']
  },
  {
    emoji: '🕹️',
    description: 'joystick',
    category: 'Activities',
    aliases: ['joystick'],
    tags: []
  },
  {
    emoji: '🎰',
    description: 'slot machine',
    category: 'Activities',
    aliases: ['slot_machine'],
    tags: []
  },
  {
    emoji: '🎲',
    description: 'game die',
    category: 'Activities',
    aliases: ['game_die'],
    tags: ['dice', 'gambling']
  },
  {
    emoji: '🧩',
    description: 'puzzle piece',
    category: 'Activities',
    aliases: ['jigsaw'],
    tags: []
  },
  {
    emoji: '🧸',
    description: 'teddy bear',
    category: 'Activities',
    aliases: ['teddy_bear'],
    tags: []
  },
  {
    emoji: '🪅',
    description: 'piñata',
    category: 'Activities',
    aliases: ['pinata'],
    tags: []
  },
  {
    emoji: '🪆',
    description: 'nesting dolls',
    category: 'Activities',
    aliases: ['nesting_dolls'],
    tags: []
  },
  {
    emoji: '♠️',
    description: 'spade suit',
    category: 'Activities',
    aliases: ['spades'],
    tags: []
  },
  {
    emoji: '♥️',
    description: 'heart suit',
    category: 'Activities',
    aliases: ['hearts'],
    tags: []
  },
  {
    emoji: '♦️',
    description: 'diamond suit',
    category: 'Activities',
    aliases: ['diamonds'],
    tags: []
  },
  {
    emoji: '♣️',
    description: 'club suit',
    category: 'Activities',
    aliases: ['clubs'],
    tags: []
  },
  {
    emoji: '♟️',
    description: 'chess pawn',
    category: 'Activities',
    aliases: ['chess_pawn'],
    tags: []
  },
  {
    emoji: '🃏',
    description: 'joker',
    category: 'Activities',
    aliases: ['black_joker'],
    tags: []
  },
  {
    emoji: '🀄',
    description: 'mahjong red dragon',
    category: 'Activities',
    aliases: ['mahjong'],
    tags: []
  },
  {
    emoji: '🎴',
    description: 'flower playing cards',
    category: 'Activities',
    aliases: ['flower_playing_cards'],
    tags: []
  },
  {
    emoji: '🎭',
    description: 'performing arts',
    category: 'Activities',
    aliases: ['performing_arts'],
    tags: ['theater', 'drama']
  },
  {
    emoji: '🖼️',
    description: 'framed picture',
    category: 'Activities',
    aliases: ['framed_picture'],
    tags: []
  },
  {
    emoji: '🎨',
    description: 'artist palette',
    category: 'Activities',
    aliases: ['art'],
    tags: ['design', 'paint']
  },
  {
    emoji: '🧵',
    description: 'thread',
    category: 'Activities',
    aliases: ['thread'],
    tags: []
  },
  {
    emoji: '🪡',
    description: 'sewing needle',
    category: 'Activities',
    aliases: ['sewing_needle'],
    tags: []
  },
  {
    emoji: '🧶',
    description: 'yarn',
    category: 'Activities',
    aliases: ['yarn'],
    tags: []
  },
  {
    emoji: '🪢',
    description: 'knot',
    category: 'Activities',
    aliases: ['knot'],
    tags: []
  },
  {
    emoji: '👓',
    description: 'glasses',
    category: 'Objects',
    aliases: ['eyeglasses'],
    tags: ['glasses']
  },
  {
    emoji: '🕶️',
    description: 'sunglasses',
    category: 'Objects',
    aliases: ['dark_sunglasses'],
    tags: []
  },
  {
    emoji: '🥽',
    description: 'goggles',
    category: 'Objects',
    aliases: ['goggles'],
    tags: []
  },
  {
    emoji: '🥼',
    description: 'lab coat',
    category: 'Objects',
    aliases: ['lab_coat'],
    tags: []
  },
  {
    emoji: '🦺',
    description: 'safety vest',
    category: 'Objects',
    aliases: ['safety_vest'],
    tags: []
  },
  {
    emoji: '👔',
    description: 'necktie',
    category: 'Objects',
    aliases: ['necktie'],
    tags: ['shirt', 'formal']
  },
  {
    emoji: '👕',
    description: 't-shirt',
    category: 'Objects',
    aliases: ['shirt', 'tshirt'],
    tags: []
  },
  {
    emoji: '👖',
    description: 'jeans',
    category: 'Objects',
    aliases: ['jeans'],
    tags: ['pants']
  },
  {
    emoji: '🧣',
    description: 'scarf',
    category: 'Objects',
    aliases: ['scarf'],
    tags: []
  },
  {
    emoji: '🧤',
    description: 'gloves',
    category: 'Objects',
    aliases: ['gloves'],
    tags: []
  },
  {
    emoji: '🧥',
    description: 'coat',
    category: 'Objects',
    aliases: ['coat'],
    tags: []
  },
  {
    emoji: '🧦',
    description: 'socks',
    category: 'Objects',
    aliases: ['socks'],
    tags: []
  },
  {
    emoji: '👗',
    description: 'dress',
    category: 'Objects',
    aliases: ['dress'],
    tags: []
  },
  {
    emoji: '👘',
    description: 'kimono',
    category: 'Objects',
    aliases: ['kimono'],
    tags: []
  },
  {
    emoji: '🥻',
    description: 'sari',
    category: 'Objects',
    aliases: ['sari'],
    tags: []
  },
  {
    emoji: '🩱',
    description: 'one-piece swimsuit',
    category: 'Objects',
    aliases: ['one_piece_swimsuit'],
    tags: []
  },
  {
    emoji: '🩲',
    description: 'briefs',
    category: 'Objects',
    aliases: ['swim_brief'],
    tags: []
  },
  {
    emoji: '🩳',
    description: 'shorts',
    category: 'Objects',
    aliases: ['shorts'],
    tags: []
  },
  {
    emoji: '👙',
    description: 'bikini',
    category: 'Objects',
    aliases: ['bikini'],
    tags: ['beach']
  },
  {
    emoji: '👚',
    description: 'woman’s clothes',
    category: 'Objects',
    aliases: ['womans_clothes'],
    tags: []
  },
  {
    emoji: '👛',
    description: 'purse',
    category: 'Objects',
    aliases: ['purse'],
    tags: []
  },
  {
    emoji: '👜',
    description: 'handbag',
    category: 'Objects',
    aliases: ['handbag'],
    tags: ['bag']
  },
  {
    emoji: '👝',
    description: 'clutch bag',
    category: 'Objects',
    aliases: ['pouch'],
    tags: ['bag']
  },
  {
    emoji: '🛍️',
    description: 'shopping bags',
    category: 'Objects',
    aliases: ['shopping'],
    tags: ['bags']
  },
  {
    emoji: '🎒',
    description: 'backpack',
    category: 'Objects',
    aliases: ['school_satchel'],
    tags: []
  },
  {
    emoji: '🩴',
    description: 'thong sandal',
    category: 'Objects',
    aliases: ['thong_sandal'],
    tags: []
  },
  {
    emoji: '👞',
    description: 'man’s shoe',
    category: 'Objects',
    aliases: ['mans_shoe', 'shoe'],
    tags: []
  },
  {
    emoji: '👟',
    description: 'running shoe',
    category: 'Objects',
    aliases: ['athletic_shoe'],
    tags: ['sneaker', 'sport', 'running']
  },
  {
    emoji: '🥾',
    description: 'hiking boot',
    category: 'Objects',
    aliases: ['hiking_boot'],
    tags: []
  },
  {
    emoji: '🥿',
    description: 'flat shoe',
    category: 'Objects',
    aliases: ['flat_shoe'],
    tags: []
  },
  {
    emoji: '👠',
    description: 'high-heeled shoe',
    category: 'Objects',
    aliases: ['high_heel'],
    tags: ['shoe']
  },
  {
    emoji: '👡',
    description: 'woman’s sandal',
    category: 'Objects',
    aliases: ['sandal'],
    tags: ['shoe']
  },
  {
    emoji: '🩰',
    description: 'ballet shoes',
    category: 'Objects',
    aliases: ['ballet_shoes'],
    tags: []
  },
  {
    emoji: '👢',
    description: 'woman’s boot',
    category: 'Objects',
    aliases: ['boot'],
    tags: []
  },
  {
    emoji: '👑',
    description: 'crown',
    category: 'Objects',
    aliases: ['crown'],
    tags: ['king', 'queen', 'royal']
  },
  {
    emoji: '👒',
    description: 'woman’s hat',
    category: 'Objects',
    aliases: ['womans_hat'],
    tags: []
  },
  {
    emoji: '🎩',
    description: 'top hat',
    category: 'Objects',
    aliases: ['tophat'],
    tags: ['hat', 'classy']
  },
  {
    emoji: '🎓',
    description: 'graduation cap',
    category: 'Objects',
    aliases: ['mortar_board'],
    tags: ['education', 'college', 'university', 'graduation']
  },
  {
    emoji: '🧢',
    description: 'billed cap',
    category: 'Objects',
    aliases: ['billed_cap'],
    tags: []
  },
  {
    emoji: '🪖',
    description: 'military helmet',
    category: 'Objects',
    aliases: ['military_helmet'],
    tags: []
  },
  {
    emoji: '⛑️',
    description: 'rescue worker’s helmet',
    category: 'Objects',
    aliases: ['rescue_worker_helmet'],
    tags: []
  },
  {
    emoji: '📿',
    description: 'prayer beads',
    category: 'Objects',
    aliases: ['prayer_beads'],
    tags: []
  },
  {
    emoji: '💄',
    description: 'lipstick',
    category: 'Objects',
    aliases: ['lipstick'],
    tags: ['makeup']
  },
  {
    emoji: '💍',
    description: 'ring',
    category: 'Objects',
    aliases: ['ring'],
    tags: ['wedding', 'marriage', 'engaged']
  },
  {
    emoji: '💎',
    description: 'gem stone',
    category: 'Objects',
    aliases: ['gem'],
    tags: ['diamond']
  },
  {
    emoji: '🔇',
    description: 'muted speaker',
    category: 'Objects',
    aliases: ['mute'],
    tags: ['sound', 'volume']
  },
  {
    emoji: '🔈',
    description: 'speaker low volume',
    category: 'Objects',
    aliases: ['speaker'],
    tags: []
  },
  {
    emoji: '🔉',
    description: 'speaker medium volume',
    category: 'Objects',
    aliases: ['sound'],
    tags: ['volume']
  },
  {
    emoji: '🔊',
    description: 'speaker high volume',
    category: 'Objects',
    aliases: ['loud_sound'],
    tags: ['volume']
  },
  {
    emoji: '📢',
    description: 'loudspeaker',
    category: 'Objects',
    aliases: ['loudspeaker'],
    tags: ['announcement']
  },
  {
    emoji: '📣',
    description: 'megaphone',
    category: 'Objects',
    aliases: ['mega'],
    tags: []
  },
  {
    emoji: '📯',
    description: 'postal horn',
    category: 'Objects',
    aliases: ['postal_horn'],
    tags: []
  },
  {
    emoji: '🔔',
    description: 'bell',
    category: 'Objects',
    aliases: ['bell'],
    tags: ['sound', 'notification']
  },
  {
    emoji: '🔕',
    description: 'bell with slash',
    category: 'Objects',
    aliases: ['no_bell'],
    tags: ['volume', 'off']
  },
  {
    emoji: '🎼',
    description: 'musical score',
    category: 'Objects',
    aliases: ['musical_score'],
    tags: []
  },
  {
    emoji: '🎵',
    description: 'musical note',
    category: 'Objects',
    aliases: ['musical_note'],
    tags: []
  },
  {
    emoji: '🎶',
    description: 'musical notes',
    category: 'Objects',
    aliases: ['notes'],
    tags: ['music']
  },
  {
    emoji: '🎙️',
    description: 'studio microphone',
    category: 'Objects',
    aliases: ['studio_microphone'],
    tags: ['podcast']
  },
  {
    emoji: '🎚️',
    description: 'level slider',
    category: 'Objects',
    aliases: ['level_slider'],
    tags: []
  },
  {
    emoji: '🎛️',
    description: 'control knobs',
    category: 'Objects',
    aliases: ['control_knobs'],
    tags: []
  },
  {
    emoji: '🎤',
    description: 'microphone',
    category: 'Objects',
    aliases: ['microphone'],
    tags: ['sing']
  },
  {
    emoji: '🎧',
    description: 'headphone',
    category: 'Objects',
    aliases: ['headphones'],
    tags: ['music', 'earphones']
  },
  {
    emoji: '📻',
    description: 'radio',
    category: 'Objects',
    aliases: ['radio'],
    tags: ['podcast']
  },
  {
    emoji: '🎷',
    description: 'saxophone',
    category: 'Objects',
    aliases: ['saxophone'],
    tags: []
  },
  {
    emoji: '🪗',
    description: 'accordion',
    category: 'Objects',
    aliases: ['accordion'],
    tags: []
  },
  {
    emoji: '🎸',
    description: 'guitar',
    category: 'Objects',
    aliases: ['guitar'],
    tags: ['rock']
  },
  {
    emoji: '🎹',
    description: 'musical keyboard',
    category: 'Objects',
    aliases: ['musical_keyboard'],
    tags: ['piano']
  },
  {
    emoji: '🎺',
    description: 'trumpet',
    category: 'Objects',
    aliases: ['trumpet'],
    tags: []
  },
  {
    emoji: '🎻',
    description: 'violin',
    category: 'Objects',
    aliases: ['violin'],
    tags: []
  },
  {
    emoji: '🪕',
    description: 'banjo',
    category: 'Objects',
    aliases: ['banjo'],
    tags: []
  },
  {
    emoji: '🥁',
    description: 'drum',
    category: 'Objects',
    aliases: ['drum'],
    tags: []
  },
  {
    emoji: '🪘',
    description: 'long drum',
    category: 'Objects',
    aliases: ['long_drum'],
    tags: []
  },
  {
    emoji: '📱',
    description: 'mobile phone',
    category: 'Objects',
    aliases: ['iphone'],
    tags: ['smartphone', 'mobile']
  },
  {
    emoji: '📲',
    description: 'mobile phone with arrow',
    category: 'Objects',
    aliases: ['calling'],
    tags: ['call', 'incoming']
  },
  {
    emoji: '☎️',
    description: 'telephone',
    category: 'Objects',
    aliases: ['phone', 'telephone'],
    tags: []
  },
  {
    emoji: '📞',
    description: 'telephone receiver',
    category: 'Objects',
    aliases: ['telephone_receiver'],
    tags: ['phone', 'call']
  },
  {
    emoji: '📟',
    description: 'pager',
    category: 'Objects',
    aliases: ['pager'],
    tags: []
  },
  {
    emoji: '📠',
    description: 'fax machine',
    category: 'Objects',
    aliases: ['fax'],
    tags: []
  },
  {
    emoji: '🔋',
    description: 'battery',
    category: 'Objects',
    aliases: ['battery'],
    tags: ['power']
  },
  {
    emoji: '🔌',
    description: 'electric plug',
    category: 'Objects',
    aliases: ['electric_plug'],
    tags: []
  },
  {
    emoji: '💻',
    description: 'laptop',
    category: 'Objects',
    aliases: ['computer'],
    tags: ['desktop', 'screen']
  },
  {
    emoji: '🖥️',
    description: 'desktop computer',
    category: 'Objects',
    aliases: ['desktop_computer'],
    tags: []
  },
  {
    emoji: '🖨️',
    description: 'printer',
    category: 'Objects',
    aliases: ['printer'],
    tags: []
  },
  {
    emoji: '⌨️',
    description: 'keyboard',
    category: 'Objects',
    aliases: ['keyboard'],
    tags: []
  },
  {
    emoji: '🖱️',
    description: 'computer mouse',
    category: 'Objects',
    aliases: ['computer_mouse'],
    tags: []
  },
  {
    emoji: '🖲️',
    description: 'trackball',
    category: 'Objects',
    aliases: ['trackball'],
    tags: []
  },
  {
    emoji: '💽',
    description: 'computer disk',
    category: 'Objects',
    aliases: ['minidisc'],
    tags: []
  },
  {
    emoji: '💾',
    description: 'floppy disk',
    category: 'Objects',
    aliases: ['floppy_disk'],
    tags: ['save']
  },
  {
    emoji: '💿',
    description: 'optical disk',
    category: 'Objects',
    aliases: ['cd'],
    tags: []
  },
  {
    emoji: '📀',
    description: 'dvd',
    category: 'Objects',
    aliases: ['dvd'],
    tags: []
  },
  {
    emoji: '🧮',
    description: 'abacus',
    category: 'Objects',
    aliases: ['abacus'],
    tags: []
  },
  {
    emoji: '🎥',
    description: 'movie camera',
    category: 'Objects',
    aliases: ['movie_camera'],
    tags: ['film', 'video']
  },
  {
    emoji: '🎞️',
    description: 'film frames',
    category: 'Objects',
    aliases: ['film_strip'],
    tags: []
  },
  {
    emoji: '📽️',
    description: 'film projector',
    category: 'Objects',
    aliases: ['film_projector'],
    tags: []
  },
  {
    emoji: '🎬',
    description: 'clapper board',
    category: 'Objects',
    aliases: ['clapper'],
    tags: ['film']
  },
  {
    emoji: '📺',
    description: 'television',
    category: 'Objects',
    aliases: ['tv'],
    tags: []
  },
  {
    emoji: '📷',
    description: 'camera',
    category: 'Objects',
    aliases: ['camera'],
    tags: ['photo']
  },
  {
    emoji: '📸',
    description: 'camera with flash',
    category: 'Objects',
    aliases: ['camera_flash'],
    tags: ['photo']
  },
  {
    emoji: '📹',
    description: 'video camera',
    category: 'Objects',
    aliases: ['video_camera'],
    tags: []
  },
  {
    emoji: '📼',
    description: 'videocassette',
    category: 'Objects',
    aliases: ['vhs'],
    tags: []
  },
  {
    emoji: '🔍',
    description: 'magnifying glass tilted left',
    category: 'Objects',
    aliases: ['mag'],
    tags: ['search', 'zoom']
  },
  {
    emoji: '🔎',
    description: 'magnifying glass tilted right',
    category: 'Objects',
    aliases: ['mag_right'],
    tags: []
  },
  {
    emoji: '🕯️',
    description: 'candle',
    category: 'Objects',
    aliases: ['candle'],
    tags: []
  },
  {
    emoji: '💡',
    description: 'light bulb',
    category: 'Objects',
    aliases: ['bulb'],
    tags: ['idea', 'light']
  },
  {
    emoji: '🔦',
    description: 'flashlight',
    category: 'Objects',
    aliases: ['flashlight'],
    tags: []
  },
  {
    emoji: '🏮',
    description: 'red paper lantern',
    category: 'Objects',
    aliases: ['izakaya_lantern', 'lantern'],
    tags: []
  },
  {
    emoji: '🪔',
    description: 'diya lamp',
    category: 'Objects',
    aliases: ['diya_lamp'],
    tags: []
  },
  {
    emoji: '📔',
    description: 'notebook with decorative cover',
    category: 'Objects',
    aliases: ['notebook_with_decorative_cover'],
    tags: []
  },
  {
    emoji: '📕',
    description: 'closed book',
    category: 'Objects',
    aliases: ['closed_book'],
    tags: []
  },
  {
    emoji: '📖',
    description: 'open book',
    category: 'Objects',
    aliases: ['book', 'open_book'],
    tags: []
  },
  {
    emoji: '📗',
    description: 'green book',
    category: 'Objects',
    aliases: ['green_book'],
    tags: []
  },
  {
    emoji: '📘',
    description: 'blue book',
    category: 'Objects',
    aliases: ['blue_book'],
    tags: []
  },
  {
    emoji: '📙',
    description: 'orange book',
    category: 'Objects',
    aliases: ['orange_book'],
    tags: []
  },
  {
    emoji: '📚',
    description: 'books',
    category: 'Objects',
    aliases: ['books'],
    tags: ['library']
  },
  {
    emoji: '📓',
    description: 'notebook',
    category: 'Objects',
    aliases: ['notebook'],
    tags: []
  },
  {
    emoji: '📒',
    description: 'ledger',
    category: 'Objects',
    aliases: ['ledger'],
    tags: []
  },
  {
    emoji: '📃',
    description: 'page with curl',
    category: 'Objects',
    aliases: ['page_with_curl'],
    tags: []
  },
  {
    emoji: '📜',
    description: 'scroll',
    category: 'Objects',
    aliases: ['scroll'],
    tags: ['document']
  },
  {
    emoji: '📄',
    description: 'page facing up',
    category: 'Objects',
    aliases: ['page_facing_up'],
    tags: ['document']
  },
  {
    emoji: '📰',
    description: 'newspaper',
    category: 'Objects',
    aliases: ['newspaper'],
    tags: ['press']
  },
  {
    emoji: '🗞️',
    description: 'rolled-up newspaper',
    category: 'Objects',
    aliases: ['newspaper_roll'],
    tags: ['press']
  },
  {
    emoji: '📑',
    description: 'bookmark tabs',
    category: 'Objects',
    aliases: ['bookmark_tabs'],
    tags: []
  },
  {
    emoji: '🔖',
    description: 'bookmark',
    category: 'Objects',
    aliases: ['bookmark'],
    tags: []
  },
  {
    emoji: '🏷️',
    description: 'label',
    category: 'Objects',
    aliases: ['label'],
    tags: ['tag']
  },
  {
    emoji: '💰',
    description: 'money bag',
    category: 'Objects',
    aliases: ['moneybag'],
    tags: ['dollar', 'cream']
  },
  {
    emoji: '🪙',
    description: 'coin',
    category: 'Objects',
    aliases: ['coin'],
    tags: []
  },
  {
    emoji: '💴',
    description: 'yen banknote',
    category: 'Objects',
    aliases: ['yen'],
    tags: []
  },
  {
    emoji: '💵',
    description: 'dollar banknote',
    category: 'Objects',
    aliases: ['dollar'],
    tags: ['money']
  },
  {
    emoji: '💶',
    description: 'euro banknote',
    category: 'Objects',
    aliases: ['euro'],
    tags: []
  },
  {
    emoji: '💷',
    description: 'pound banknote',
    category: 'Objects',
    aliases: ['pound'],
    tags: []
  },
  {
    emoji: '💸',
    description: 'money with wings',
    category: 'Objects',
    aliases: ['money_with_wings'],
    tags: ['dollar']
  },
  {
    emoji: '💳',
    description: 'credit card',
    category: 'Objects',
    aliases: ['credit_card'],
    tags: ['subscription']
  },
  {
    emoji: '🧾',
    description: 'receipt',
    category: 'Objects',
    aliases: ['receipt'],
    tags: []
  },
  {
    emoji: '💹',
    description: 'chart increasing with yen',
    category: 'Objects',
    aliases: ['chart'],
    tags: []
  },
  {
    emoji: '✉️',
    description: 'envelope',
    category: 'Objects',
    aliases: ['envelope'],
    tags: ['letter', 'email']
  },
  {
    emoji: '📧',
    description: 'e-mail',
    category: 'Objects',
    aliases: ['email', 'e-mail'],
    tags: []
  },
  {
    emoji: '📨',
    description: 'incoming envelope',
    category: 'Objects',
    aliases: ['incoming_envelope'],
    tags: []
  },
  {
    emoji: '📩',
    description: 'envelope with arrow',
    category: 'Objects',
    aliases: ['envelope_with_arrow'],
    tags: []
  },
  {
    emoji: '📤',
    description: 'outbox tray',
    category: 'Objects',
    aliases: ['outbox_tray'],
    tags: []
  },
  {
    emoji: '📥',
    description: 'inbox tray',
    category: 'Objects',
    aliases: ['inbox_tray'],
    tags: []
  },
  {
    emoji: '📦',
    description: 'package',
    category: 'Objects',
    aliases: ['package'],
    tags: ['shipping']
  },
  {
    emoji: '📫',
    description: 'closed mailbox with raised flag',
    category: 'Objects',
    aliases: ['mailbox'],
    tags: []
  },
  {
    emoji: '📪',
    description: 'closed mailbox with lowered flag',
    category: 'Objects',
    aliases: ['mailbox_closed'],
    tags: []
  },
  {
    emoji: '📬',
    description: 'open mailbox with raised flag',
    category: 'Objects',
    aliases: ['mailbox_with_mail'],
    tags: []
  },
  {
    emoji: '📭',
    description: 'open mailbox with lowered flag',
    category: 'Objects',
    aliases: ['mailbox_with_no_mail'],
    tags: []
  },
  {
    emoji: '📮',
    description: 'postbox',
    category: 'Objects',
    aliases: ['postbox'],
    tags: []
  },
  {
    emoji: '🗳️',
    description: 'ballot box with ballot',
    category: 'Objects',
    aliases: ['ballot_box'],
    tags: []
  },
  {
    emoji: '✏️',
    description: 'pencil',
    category: 'Objects',
    aliases: ['pencil2'],
    tags: []
  },
  {
    emoji: '✒️',
    description: 'black nib',
    category: 'Objects',
    aliases: ['black_nib'],
    tags: []
  },
  {
    emoji: '🖋️',
    description: 'fountain pen',
    category: 'Objects',
    aliases: ['fountain_pen'],
    tags: []
  },
  {
    emoji: '🖊️',
    description: 'pen',
    category: 'Objects',
    aliases: ['pen'],
    tags: []
  },
  {
    emoji: '🖌️',
    description: 'paintbrush',
    category: 'Objects',
    aliases: ['paintbrush'],
    tags: []
  },
  {
    emoji: '🖍️',
    description: 'crayon',
    category: 'Objects',
    aliases: ['crayon'],
    tags: []
  },
  {
    emoji: '📝',
    description: 'memo',
    category: 'Objects',
    aliases: ['memo', 'pencil'],
    tags: ['document', 'note']
  },
  {
    emoji: '💼',
    description: 'briefcase',
    category: 'Objects',
    aliases: ['briefcase'],
    tags: ['business']
  },
  {
    emoji: '📁',
    description: 'file folder',
    category: 'Objects',
    aliases: ['file_folder'],
    tags: ['directory']
  },
  {
    emoji: '📂',
    description: 'open file folder',
    category: 'Objects',
    aliases: ['open_file_folder'],
    tags: []
  },
  {
    emoji: '🗂️',
    description: 'card index dividers',
    category: 'Objects',
    aliases: ['card_index_dividers'],
    tags: []
  },
  {
    emoji: '📅',
    description: 'calendar',
    category: 'Objects',
    aliases: ['date'],
    tags: ['calendar', 'schedule']
  },
  {
    emoji: '📆',
    description: 'tear-off calendar',
    category: 'Objects',
    aliases: ['calendar'],
    tags: ['schedule']
  },
  {
    emoji: '🗒️',
    description: 'spiral notepad',
    category: 'Objects',
    aliases: ['spiral_notepad'],
    tags: []
  },
  {
    emoji: '🗓️',
    description: 'spiral calendar',
    category: 'Objects',
    aliases: ['spiral_calendar'],
    tags: []
  },
  {
    emoji: '📇',
    description: 'card index',
    category: 'Objects',
    aliases: ['card_index'],
    tags: []
  },
  {
    emoji: '📈',
    description: 'chart increasing',
    category: 'Objects',
    aliases: ['chart_with_upwards_trend'],
    tags: ['graph', 'metrics']
  },
  {
    emoji: '📉',
    description: 'chart decreasing',
    category: 'Objects',
    aliases: ['chart_with_downwards_trend'],
    tags: ['graph', 'metrics']
  },
  {
    emoji: '📊',
    description: 'bar chart',
    category: 'Objects',
    aliases: ['bar_chart'],
    tags: ['stats', 'metrics']
  },
  {
    emoji: '📋',
    description: 'clipboard',
    category: 'Objects',
    aliases: ['clipboard'],
    tags: []
  },
  {
    emoji: '📌',
    description: 'pushpin',
    category: 'Objects',
    aliases: ['pushpin'],
    tags: ['location']
  },
  {
    emoji: '📍',
    description: 'round pushpin',
    category: 'Objects',
    aliases: ['round_pushpin'],
    tags: ['location']
  },
  {
    emoji: '📎',
    description: 'paperclip',
    category: 'Objects',
    aliases: ['paperclip'],
    tags: []
  },
  {
    emoji: '🖇️',
    description: 'linked paperclips',
    category: 'Objects',
    aliases: ['paperclips'],
    tags: []
  },
  {
    emoji: '📏',
    description: 'straight ruler',
    category: 'Objects',
    aliases: ['straight_ruler'],
    tags: []
  },
  {
    emoji: '📐',
    description: 'triangular ruler',
    category: 'Objects',
    aliases: ['triangular_ruler'],
    tags: []
  },
  {
    emoji: '✂️',
    description: 'scissors',
    category: 'Objects',
    aliases: ['scissors'],
    tags: ['cut']
  },
  {
    emoji: '🗃️',
    description: 'card file box',
    category: 'Objects',
    aliases: ['card_file_box'],
    tags: []
  },
  {
    emoji: '🗄️',
    description: 'file cabinet',
    category: 'Objects',
    aliases: ['file_cabinet'],
    tags: []
  },
  {
    emoji: '🗑️',
    description: 'wastebasket',
    category: 'Objects',
    aliases: ['wastebasket'],
    tags: ['trash']
  },
  {
    emoji: '🔒',
    description: 'locked',
    category: 'Objects',
    aliases: ['lock'],
    tags: ['security', 'private']
  },
  {
    emoji: '🔓',
    description: 'unlocked',
    category: 'Objects',
    aliases: ['unlock'],
    tags: ['security']
  },
  {
    emoji: '🔏',
    description: 'locked with pen',
    category: 'Objects',
    aliases: ['lock_with_ink_pen'],
    tags: []
  },
  {
    emoji: '🔐',
    description: 'locked with key',
    category: 'Objects',
    aliases: ['closed_lock_with_key'],
    tags: ['security']
  },
  {
    emoji: '🔑',
    description: 'key',
    category: 'Objects',
    aliases: ['key'],
    tags: ['lock', 'password']
  },
  {
    emoji: '🗝️',
    description: 'old key',
    category: 'Objects',
    aliases: ['old_key'],
    tags: []
  },
  {
    emoji: '🔨',
    description: 'hammer',
    category: 'Objects',
    aliases: ['hammer'],
    tags: ['tool']
  },
  {
    emoji: '🪓',
    description: 'axe',
    category: 'Objects',
    aliases: ['axe'],
    tags: []
  },
  {
    emoji: '⛏️',
    description: 'pick',
    category: 'Objects',
    aliases: ['pick'],
    tags: []
  },
  {
    emoji: '⚒️',
    description: 'hammer and pick',
    category: 'Objects',
    aliases: ['hammer_and_pick'],
    tags: []
  },
  {
    emoji: '🛠️',
    description: 'hammer and wrench',
    category: 'Objects',
    aliases: ['hammer_and_wrench'],
    tags: []
  },
  {
    emoji: '🗡️',
    description: 'dagger',
    category: 'Objects',
    aliases: ['dagger'],
    tags: []
  },
  {
    emoji: '⚔️',
    description: 'crossed swords',
    category: 'Objects',
    aliases: ['crossed_swords'],
    tags: []
  },
  {
    emoji: '🔫',
    description: 'water pistol',
    category: 'Objects',
    aliases: ['gun'],
    tags: ['shoot', 'weapon']
  },
  {
    emoji: '🪃',
    description: 'boomerang',
    category: 'Objects',
    aliases: ['boomerang'],
    tags: []
  },
  {
    emoji: '🏹',
    description: 'bow and arrow',
    category: 'Objects',
    aliases: ['bow_and_arrow'],
    tags: ['archery']
  },
  {
    emoji: '🛡️',
    description: 'shield',
    category: 'Objects',
    aliases: ['shield'],
    tags: []
  },
  {
    emoji: '🪚',
    description: 'carpentry saw',
    category: 'Objects',
    aliases: ['carpentry_saw'],
    tags: []
  },
  {
    emoji: '🔧',
    description: 'wrench',
    category: 'Objects',
    aliases: ['wrench'],
    tags: ['tool']
  },
  {
    emoji: '🪛',
    description: 'screwdriver',
    category: 'Objects',
    aliases: ['screwdriver'],
    tags: []
  },
  {
    emoji: '🔩',
    description: 'nut and bolt',
    category: 'Objects',
    aliases: ['nut_and_bolt'],
    tags: []
  },
  {
    emoji: '⚙️',
    description: 'gear',
    category: 'Objects',
    aliases: ['gear'],
    tags: []
  },
  {
    emoji: '🗜️',
    description: 'clamp',
    category: 'Objects',
    aliases: ['clamp'],
    tags: []
  },
  {
    emoji: '⚖️',
    description: 'balance scale',
    category: 'Objects',
    aliases: ['balance_scale'],
    tags: []
  },
  {
    emoji: '🦯',
    description: 'white cane',
    category: 'Objects',
    aliases: ['probing_cane'],
    tags: []
  },
  {
    emoji: '🔗',
    description: 'link',
    category: 'Objects',
    aliases: ['link'],
    tags: []
  },
  {
    emoji: '⛓️',
    description: 'chains',
    category: 'Objects',
    aliases: ['chains'],
    tags: []
  },
  {
    emoji: '🪝',
    description: 'hook',
    category: 'Objects',
    aliases: ['hook'],
    tags: []
  },
  {
    emoji: '🧰',
    description: 'toolbox',
    category: 'Objects',
    aliases: ['toolbox'],
    tags: []
  },
  {
    emoji: '🧲',
    description: 'magnet',
    category: 'Objects',
    aliases: ['magnet'],
    tags: []
  },
  {
    emoji: '🪜',
    description: 'ladder',
    category: 'Objects',
    aliases: ['ladder'],
    tags: []
  },
  {
    emoji: '⚗️',
    description: 'alembic',
    category: 'Objects',
    aliases: ['alembic'],
    tags: []
  },
  {
    emoji: '🧪',
    description: 'test tube',
    category: 'Objects',
    aliases: ['test_tube'],
    tags: []
  },
  {
    emoji: '🧫',
    description: 'petri dish',
    category: 'Objects',
    aliases: ['petri_dish'],
    tags: []
  },
  {
    emoji: '🧬',
    description: 'dna',
    category: 'Objects',
    aliases: ['dna'],
    tags: []
  },
  {
    emoji: '🔬',
    description: 'microscope',
    category: 'Objects',
    aliases: ['microscope'],
    tags: ['science', 'laboratory', 'investigate']
  },
  {
    emoji: '🔭',
    description: 'telescope',
    category: 'Objects',
    aliases: ['telescope'],
    tags: []
  },
  {
    emoji: '📡',
    description: 'satellite antenna',
    category: 'Objects',
    aliases: ['satellite'],
    tags: ['signal']
  },
  {
    emoji: '💉',
    description: 'syringe',
    category: 'Objects',
    aliases: ['syringe'],
    tags: ['health', 'hospital', 'needle']
  },
  {
    emoji: '🩸',
    description: 'drop of blood',
    category: 'Objects',
    aliases: ['drop_of_blood'],
    tags: []
  },
  {
    emoji: '💊',
    description: 'pill',
    category: 'Objects',
    aliases: ['pill'],
    tags: ['health', 'medicine']
  },
  {
    emoji: '🩹',
    description: 'adhesive bandage',
    category: 'Objects',
    aliases: ['adhesive_bandage'],
    tags: []
  },
  {
    emoji: '🩺',
    description: 'stethoscope',
    category: 'Objects',
    aliases: ['stethoscope'],
    tags: []
  },
  {
    emoji: '🚪',
    description: 'door',
    category: 'Objects',
    aliases: ['door'],
    tags: []
  },
  {
    emoji: '🛗',
    description: 'elevator',
    category: 'Objects',
    aliases: ['elevator'],
    tags: []
  },
  {
    emoji: '🪞',
    description: 'mirror',
    category: 'Objects',
    aliases: ['mirror'],
    tags: []
  },
  {
    emoji: '🪟',
    description: 'window',
    category: 'Objects',
    aliases: ['window'],
    tags: []
  },
  {
    emoji: '🛏️',
    description: 'bed',
    category: 'Objects',
    aliases: ['bed'],
    tags: []
  },
  {
    emoji: '🛋️',
    description: 'couch and lamp',
    category: 'Objects',
    aliases: ['couch_and_lamp'],
    tags: []
  },
  {
    emoji: '🪑',
    description: 'chair',
    category: 'Objects',
    aliases: ['chair'],
    tags: []
  },
  {
    emoji: '🚽',
    description: 'toilet',
    category: 'Objects',
    aliases: ['toilet'],
    tags: ['wc']
  },
  {
    emoji: '🪠',
    description: 'plunger',
    category: 'Objects',
    aliases: ['plunger'],
    tags: []
  },
  {
    emoji: '🚿',
    description: 'shower',
    category: 'Objects',
    aliases: ['shower'],
    tags: ['bath']
  },
  {
    emoji: '🛁',
    description: 'bathtub',
    category: 'Objects',
    aliases: ['bathtub'],
    tags: []
  },
  {
    emoji: '🪤',
    description: 'mouse trap',
    category: 'Objects',
    aliases: ['mouse_trap'],
    tags: []
  },
  {
    emoji: '🪒',
    description: 'razor',
    category: 'Objects',
    aliases: ['razor'],
    tags: []
  },
  {
    emoji: '🧴',
    description: 'lotion bottle',
    category: 'Objects',
    aliases: ['lotion_bottle'],
    tags: []
  },
  {
    emoji: '🧷',
    description: 'safety pin',
    category: 'Objects',
    aliases: ['safety_pin'],
    tags: []
  },
  {
    emoji: '🧹',
    description: 'broom',
    category: 'Objects',
    aliases: ['broom'],
    tags: []
  },
  {
    emoji: '🧺',
    description: 'basket',
    category: 'Objects',
    aliases: ['basket'],
    tags: []
  },
  {
    emoji: '🧻',
    description: 'roll of paper',
    category: 'Objects',
    aliases: ['roll_of_paper'],
    tags: ['toilet']
  },
  {
    emoji: '🪣',
    description: 'bucket',
    category: 'Objects',
    aliases: ['bucket'],
    tags: []
  },
  {
    emoji: '🧼',
    description: 'soap',
    category: 'Objects',
    aliases: ['soap'],
    tags: []
  },
  {
    emoji: '🪥',
    description: 'toothbrush',
    category: 'Objects',
    aliases: ['toothbrush'],
    tags: []
  },
  {
    emoji: '🧽',
    description: 'sponge',
    category: 'Objects',
    aliases: ['sponge'],
    tags: []
  },
  {
    emoji: '🧯',
    description: 'fire extinguisher',
    category: 'Objects',
    aliases: ['fire_extinguisher'],
    tags: []
  },
  {
    emoji: '🛒',
    description: 'shopping cart',
    category: 'Objects',
    aliases: ['shopping_cart'],
    tags: []
  },
  {
    emoji: '🚬',
    description: 'cigarette',
    category: 'Objects',
    aliases: ['smoking'],
    tags: ['cigarette']
  },
  {
    emoji: '⚰️',
    description: 'coffin',
    category: 'Objects',
    aliases: ['coffin'],
    tags: ['funeral']
  },
  {
    emoji: '🪦',
    description: 'headstone',
    category: 'Objects',
    aliases: ['headstone'],
    tags: []
  },
  {
    emoji: '⚱️',
    description: 'funeral urn',
    category: 'Objects',
    aliases: ['funeral_urn'],
    tags: []
  },
  {
    emoji: '🗿',
    description: 'moai',
    category: 'Objects',
    aliases: ['moyai'],
    tags: ['stone']
  },
  {
    emoji: '🪧',
    description: 'placard',
    category: 'Objects',
    aliases: ['placard'],
    tags: []
  },
  {
    emoji: '🏧',
    description: 'ATM sign',
    category: 'Symbols',
    aliases: ['atm'],
    tags: []
  },
  {
    emoji: '🚮',
    description: 'litter in bin sign',
    category: 'Symbols',
    aliases: ['put_litter_in_its_place'],
    tags: []
  },
  {
    emoji: '🚰',
    description: 'potable water',
    category: 'Symbols',
    aliases: ['potable_water'],
    tags: []
  },
  {
    emoji: '♿',
    description: 'wheelchair symbol',
    category: 'Symbols',
    aliases: ['wheelchair'],
    tags: ['accessibility']
  },
  {
    emoji: '🚹',
    description: 'men’s room',
    category: 'Symbols',
    aliases: ['mens'],
    tags: []
  },
  {
    emoji: '🚺',
    description: 'women’s room',
    category: 'Symbols',
    aliases: ['womens'],
    tags: []
  },
  {
    emoji: '🚻',
    description: 'restroom',
    category: 'Symbols',
    aliases: ['restroom'],
    tags: ['toilet']
  },
  {
    emoji: '🚼',
    description: 'baby symbol',
    category: 'Symbols',
    aliases: ['baby_symbol'],
    tags: []
  },
  {
    emoji: '🚾',
    description: 'water closet',
    category: 'Symbols',
    aliases: ['wc'],
    tags: ['toilet', 'restroom']
  },
  {
    emoji: '🛂',
    description: 'passport control',
    category: 'Symbols',
    aliases: ['passport_control'],
    tags: []
  },
  {
    emoji: '🛃',
    description: 'customs',
    category: 'Symbols',
    aliases: ['customs'],
    tags: []
  },
  {
    emoji: '🛄',
    description: 'baggage claim',
    category: 'Symbols',
    aliases: ['baggage_claim'],
    tags: ['airport']
  },
  {
    emoji: '🛅',
    description: 'left luggage',
    category: 'Symbols',
    aliases: ['left_luggage'],
    tags: []
  },
  {
    emoji: '⚠️',
    description: 'warning',
    category: 'Symbols',
    aliases: ['warning'],
    tags: ['wip']
  },
  {
    emoji: '🚸',
    description: 'children crossing',
    category: 'Symbols',
    aliases: ['children_crossing'],
    tags: []
  },
  {
    emoji: '⛔',
    description: 'no entry',
    category: 'Symbols',
    aliases: ['no_entry'],
    tags: ['limit']
  },
  {
    emoji: '🚫',
    description: 'prohibited',
    category: 'Symbols',
    aliases: ['no_entry_sign'],
    tags: ['block', 'forbidden']
  },
  {
    emoji: '🚳',
    description: 'no bicycles',
    category: 'Symbols',
    aliases: ['no_bicycles'],
    tags: []
  },
  {
    emoji: '🚭',
    description: 'no smoking',
    category: 'Symbols',
    aliases: ['no_smoking'],
    tags: []
  },
  {
    emoji: '🚯',
    description: 'no littering',
    category: 'Symbols',
    aliases: ['do_not_litter'],
    tags: []
  },
  {
    emoji: '🚱',
    description: 'non-potable water',
    category: 'Symbols',
    aliases: ['non-potable_water'],
    tags: []
  },
  {
    emoji: '🚷',
    description: 'no pedestrians',
    category: 'Symbols',
    aliases: ['no_pedestrians'],
    tags: []
  },
  {
    emoji: '📵',
    description: 'no mobile phones',
    category: 'Symbols',
    aliases: ['no_mobile_phones'],
    tags: []
  },
  {
    emoji: '🔞',
    description: 'no one under eighteen',
    category: 'Symbols',
    aliases: ['underage'],
    tags: []
  },
  {
    emoji: '☢️',
    description: 'radioactive',
    category: 'Symbols',
    aliases: ['radioactive'],
    tags: []
  },
  {
    emoji: '☣️',
    description: 'biohazard',
    category: 'Symbols',
    aliases: ['biohazard'],
    tags: []
  },
  {
    emoji: '⬆️',
    description: 'up arrow',
    category: 'Symbols',
    aliases: ['arrow_up'],
    tags: []
  },
  {
    emoji: '↗️',
    description: 'up-right arrow',
    category: 'Symbols',
    aliases: ['arrow_upper_right'],
    tags: []
  },
  {
    emoji: '➡️',
    description: 'right arrow',
    category: 'Symbols',
    aliases: ['arrow_right'],
    tags: []
  },
  {
    emoji: '↘️',
    description: 'down-right arrow',
    category: 'Symbols',
    aliases: ['arrow_lower_right'],
    tags: []
  },
  {
    emoji: '⬇️',
    description: 'down arrow',
    category: 'Symbols',
    aliases: ['arrow_down'],
    tags: []
  },
  {
    emoji: '↙️',
    description: 'down-left arrow',
    category: 'Symbols',
    aliases: ['arrow_lower_left'],
    tags: []
  },
  {
    emoji: '⬅️',
    description: 'left arrow',
    category: 'Symbols',
    aliases: ['arrow_left'],
    tags: []
  },
  {
    emoji: '↖️',
    description: 'up-left arrow',
    category: 'Symbols',
    aliases: ['arrow_upper_left'],
    tags: []
  },
  {
    emoji: '↕️',
    description: 'up-down arrow',
    category: 'Symbols',
    aliases: ['arrow_up_down'],
    tags: []
  },
  {
    emoji: '↔️',
    description: 'left-right arrow',
    category: 'Symbols',
    aliases: ['left_right_arrow'],
    tags: []
  },
  {
    emoji: '↩️',
    description: 'right arrow curving left',
    category: 'Symbols',
    aliases: ['leftwards_arrow_with_hook'],
    tags: ['return']
  },
  {
    emoji: '↪️',
    description: 'left arrow curving right',
    category: 'Symbols',
    aliases: ['arrow_right_hook'],
    tags: []
  },
  {
    emoji: '⤴️',
    description: 'right arrow curving up',
    category: 'Symbols',
    aliases: ['arrow_heading_up'],
    tags: []
  },
  {
    emoji: '⤵️',
    description: 'right arrow curving down',
    category: 'Symbols',
    aliases: ['arrow_heading_down'],
    tags: []
  },
  {
    emoji: '🔃',
    description: 'clockwise vertical arrows',
    category: 'Symbols',
    aliases: ['arrows_clockwise'],
    tags: []
  },
  {
    emoji: '🔄',
    description: 'counterclockwise arrows button',
    category: 'Symbols',
    aliases: ['arrows_counterclockwise'],
    tags: ['sync']
  },
  {
    emoji: '🔙',
    description: 'BACK arrow',
    category: 'Symbols',
    aliases: ['back'],
    tags: []
  },
  {
    emoji: '🔚',
    description: 'END arrow',
    category: 'Symbols',
    aliases: ['end'],
    tags: []
  },
  {
    emoji: '🔛',
    description: 'ON! arrow',
    category: 'Symbols',
    aliases: ['on'],
    tags: []
  },
  {
    emoji: '🔜',
    description: 'SOON arrow',
    category: 'Symbols',
    aliases: ['soon'],
    tags: []
  },
  {
    emoji: '🔝',
    description: 'TOP arrow',
    category: 'Symbols',
    aliases: ['top'],
    tags: []
  },
  {
    emoji: '🛐',
    description: 'place of worship',
    category: 'Symbols',
    aliases: ['place_of_worship'],
    tags: []
  },
  {
    emoji: '⚛️',
    description: 'atom symbol',
    category: 'Symbols',
    aliases: ['atom_symbol'],
    tags: []
  },
  {
    emoji: '🕉️',
    description: 'om',
    category: 'Symbols',
    aliases: ['om'],
    tags: []
  },
  {
    emoji: '✡️',
    description: 'star of David',
    category: 'Symbols',
    aliases: ['star_of_david'],
    tags: []
  },
  {
    emoji: '☸️',
    description: 'wheel of dharma',
    category: 'Symbols',
    aliases: ['wheel_of_dharma'],
    tags: []
  },
  {
    emoji: '☯️',
    description: 'yin yang',
    category: 'Symbols',
    aliases: ['yin_yang'],
    tags: []
  },
  {
    emoji: '✝️',
    description: 'latin cross',
    category: 'Symbols',
    aliases: ['latin_cross'],
    tags: []
  },
  {
    emoji: '☦️',
    description: 'orthodox cross',
    category: 'Symbols',
    aliases: ['orthodox_cross'],
    tags: []
  },
  {
    emoji: '☪️',
    description: 'star and crescent',
    category: 'Symbols',
    aliases: ['star_and_crescent'],
    tags: []
  },
  {
    emoji: '☮️',
    description: 'peace symbol',
    category: 'Symbols',
    aliases: ['peace_symbol'],
    tags: []
  },
  {
    emoji: '🕎',
    description: 'menorah',
    category: 'Symbols',
    aliases: ['menorah'],
    tags: []
  },
  {
    emoji: '🔯',
    description: 'dotted six-pointed star',
    category: 'Symbols',
    aliases: ['six_pointed_star'],
    tags: []
  },
  {
    emoji: '♈',
    description: 'Aries',
    category: 'Symbols',
    aliases: ['aries'],
    tags: []
  },
  {
    emoji: '♉',
    description: 'Taurus',
    category: 'Symbols',
    aliases: ['taurus'],
    tags: []
  },
  {
    emoji: '♊',
    description: 'Gemini',
    category: 'Symbols',
    aliases: ['gemini'],
    tags: []
  },
  {
    emoji: '♋',
    description: 'Cancer',
    category: 'Symbols',
    aliases: ['cancer'],
    tags: []
  },
  {
    emoji: '♌',
    description: 'Leo',
    category: 'Symbols',
    aliases: ['leo'],
    tags: []
  },
  {
    emoji: '♍',
    description: 'Virgo',
    category: 'Symbols',
    aliases: ['virgo'],
    tags: []
  },
  {
    emoji: '♎',
    description: 'Libra',
    category: 'Symbols',
    aliases: ['libra'],
    tags: []
  },
  {
    emoji: '♏',
    description: 'Scorpio',
    category: 'Symbols',
    aliases: ['scorpius'],
    tags: []
  },
  {
    emoji: '♐',
    description: 'Sagittarius',
    category: 'Symbols',
    aliases: ['sagittarius'],
    tags: []
  },
  {
    emoji: '♑',
    description: 'Capricorn',
    category: 'Symbols',
    aliases: ['capricorn'],
    tags: []
  },
  {
    emoji: '♒',
    description: 'Aquarius',
    category: 'Symbols',
    aliases: ['aquarius'],
    tags: []
  },
  {
    emoji: '♓',
    description: 'Pisces',
    category: 'Symbols',
    aliases: ['pisces'],
    tags: []
  },
  {
    emoji: '⛎',
    description: 'Ophiuchus',
    category: 'Symbols',
    aliases: ['ophiuchus'],
    tags: []
  },
  {
    emoji: '🔀',
    description: 'shuffle tracks button',
    category: 'Symbols',
    aliases: ['twisted_rightwards_arrows'],
    tags: ['shuffle']
  },
  {
    emoji: '🔁',
    description: 'repeat button',
    category: 'Symbols',
    aliases: ['repeat'],
    tags: ['loop']
  },
  {
    emoji: '🔂',
    description: 'repeat single button',
    category: 'Symbols',
    aliases: ['repeat_one'],
    tags: []
  },
  {
    emoji: '▶️',
    description: 'play button',
    category: 'Symbols',
    aliases: ['arrow_forward'],
    tags: []
  },
  {
    emoji: '⏩',
    description: 'fast-forward button',
    category: 'Symbols',
    aliases: ['fast_forward'],
    tags: []
  },
  {
    emoji: '⏭️',
    description: 'next track button',
    category: 'Symbols',
    aliases: ['next_track_button'],
    tags: []
  },
  {
    emoji: '⏯️',
    description: 'play or pause button',
    category: 'Symbols',
    aliases: ['play_or_pause_button'],
    tags: []
  },
  {
    emoji: '◀️',
    description: 'reverse button',
    category: 'Symbols',
    aliases: ['arrow_backward'],
    tags: []
  },
  {
    emoji: '⏪',
    description: 'fast reverse button',
    category: 'Symbols',
    aliases: ['rewind'],
    tags: []
  },
  {
    emoji: '⏮️',
    description: 'last track button',
    category: 'Symbols',
    aliases: ['previous_track_button'],
    tags: []
  },
  {
    emoji: '🔼',
    description: 'upwards button',
    category: 'Symbols',
    aliases: ['arrow_up_small'],
    tags: []
  },
  {
    emoji: '⏫',
    description: 'fast up button',
    category: 'Symbols',
    aliases: ['arrow_double_up'],
    tags: []
  },
  {
    emoji: '🔽',
    description: 'downwards button',
    category: 'Symbols',
    aliases: ['arrow_down_small'],
    tags: []
  },
  {
    emoji: '⏬',
    description: 'fast down button',
    category: 'Symbols',
    aliases: ['arrow_double_down'],
    tags: []
  },
  {
    emoji: '⏸️',
    description: 'pause button',
    category: 'Symbols',
    aliases: ['pause_button'],
    tags: []
  },
  {
    emoji: '⏹️',
    description: 'stop button',
    category: 'Symbols',
    aliases: ['stop_button'],
    tags: []
  },
  {
    emoji: '⏺️',
    description: 'record button',
    category: 'Symbols',
    aliases: ['record_button'],
    tags: []
  },
  {
    emoji: '⏏️',
    description: 'eject button',
    category: 'Symbols',
    aliases: ['eject_button'],
    tags: []
  },
  {
    emoji: '🎦',
    description: 'cinema',
    category: 'Symbols',
    aliases: ['cinema'],
    tags: ['film', 'movie']
  },
  {
    emoji: '🔅',
    description: 'dim button',
    category: 'Symbols',
    aliases: ['low_brightness'],
    tags: []
  },
  {
    emoji: '🔆',
    description: 'bright button',
    category: 'Symbols',
    aliases: ['high_brightness'],
    tags: []
  },
  {
    emoji: '📶',
    description: 'antenna bars',
    category: 'Symbols',
    aliases: ['signal_strength'],
    tags: ['wifi']
  },
  {
    emoji: '📳',
    description: 'vibration mode',
    category: 'Symbols',
    aliases: ['vibration_mode'],
    tags: []
  },
  {
    emoji: '📴',
    description: 'mobile phone off',
    category: 'Symbols',
    aliases: ['mobile_phone_off'],
    tags: ['mute', 'off']
  },
  {
    emoji: '♀️',
    description: 'female sign',
    category: 'Symbols',
    aliases: ['female_sign'],
    tags: []
  },
  {
    emoji: '♂️',
    description: 'male sign',
    category: 'Symbols',
    aliases: ['male_sign'],
    tags: []
  },
  {
    emoji: '⚧️',
    description: 'transgender symbol',
    category: 'Symbols',
    aliases: ['transgender_symbol'],
    tags: []
  },
  {
    emoji: '✖️',
    description: 'multiply',
    category: 'Symbols',
    aliases: ['heavy_multiplication_x'],
    tags: []
  },
  {
    emoji: '➕',
    description: 'plus',
    category: 'Symbols',
    aliases: ['heavy_plus_sign'],
    tags: []
  },
  {
    emoji: '➖',
    description: 'minus',
    category: 'Symbols',
    aliases: ['heavy_minus_sign'],
    tags: []
  },
  {
    emoji: '➗',
    description: 'divide',
    category: 'Symbols',
    aliases: ['heavy_division_sign'],
    tags: []
  },
  {
    emoji: '♾️',
    description: 'infinity',
    category: 'Symbols',
    aliases: ['infinity'],
    tags: []
  },
  {
    emoji: '‼️',
    description: 'double exclamation mark',
    category: 'Symbols',
    aliases: ['bangbang'],
    tags: []
  },
  {
    emoji: '⁉️',
    description: 'exclamation question mark',
    category: 'Symbols',
    aliases: ['interrobang'],
    tags: []
  },
  {
    emoji: '❓',
    description: 'red question mark',
    category: 'Symbols',
    aliases: ['question'],
    tags: ['confused']
  },
  {
    emoji: '❔',
    description: 'white question mark',
    category: 'Symbols',
    aliases: ['grey_question'],
    tags: []
  },
  {
    emoji: '❕',
    description: 'white exclamation mark',
    category: 'Symbols',
    aliases: ['grey_exclamation'],
    tags: []
  },
  {
    emoji: '❗',
    description: 'red exclamation mark',
    category: 'Symbols',
    aliases: ['exclamation', 'heavy_exclamation_mark'],
    tags: ['bang']
  },
  {
    emoji: '〰️',
    description: 'wavy dash',
    category: 'Symbols',
    aliases: ['wavy_dash'],
    tags: []
  },
  {
    emoji: '💱',
    description: 'currency exchange',
    category: 'Symbols',
    aliases: ['currency_exchange'],
    tags: []
  },
  {
    emoji: '💲',
    description: 'heavy dollar sign',
    category: 'Symbols',
    aliases: ['heavy_dollar_sign'],
    tags: []
  },
  {
    emoji: '⚕️',
    description: 'medical symbol',
    category: 'Symbols',
    aliases: ['medical_symbol'],
    tags: []
  },
  {
    emoji: '♻️',
    description: 'recycling symbol',
    category: 'Symbols',
    aliases: ['recycle'],
    tags: ['environment', 'green']
  },
  {
    emoji: '⚜️',
    description: 'fleur-de-lis',
    category: 'Symbols',
    aliases: ['fleur_de_lis'],
    tags: []
  },
  {
    emoji: '🔱',
    description: 'trident emblem',
    category: 'Symbols',
    aliases: ['trident'],
    tags: []
  },
  {
    emoji: '📛',
    description: 'name badge',
    category: 'Symbols',
    aliases: ['name_badge'],
    tags: []
  },
  {
    emoji: '🔰',
    description: 'Japanese symbol for beginner',
    category: 'Symbols',
    aliases: ['beginner'],
    tags: []
  },
  {
    emoji: '⭕',
    description: 'hollow red circle',
    category: 'Symbols',
    aliases: ['o'],
    tags: []
  },
  {
    emoji: '✅',
    description: 'check mark button',
    category: 'Symbols',
    aliases: ['white_check_mark'],
    tags: []
  },
  {
    emoji: '☑️',
    description: 'check box with check',
    category: 'Symbols',
    aliases: ['ballot_box_with_check'],
    tags: []
  },
  {
    emoji: '✔️',
    description: 'check mark',
    category: 'Symbols',
    aliases: ['heavy_check_mark'],
    tags: []
  },
  {
    emoji: '❌',
    description: 'cross mark',
    category: 'Symbols',
    aliases: ['x'],
    tags: []
  },
  {
    emoji: '❎',
    description: 'cross mark button',
    category: 'Symbols',
    aliases: ['negative_squared_cross_mark'],
    tags: []
  },
  {
    emoji: '➰',
    description: 'curly loop',
    category: 'Symbols',
    aliases: ['curly_loop'],
    tags: []
  },
  {
    emoji: '➿',
    description: 'double curly loop',
    category: 'Symbols',
    aliases: ['loop'],
    tags: []
  },
  {
    emoji: '〽️',
    description: 'part alternation mark',
    category: 'Symbols',
    aliases: ['part_alternation_mark'],
    tags: []
  },
  {
    emoji: '✳️',
    description: 'eight-spoked asterisk',
    category: 'Symbols',
    aliases: ['eight_spoked_asterisk'],
    tags: []
  },
  {
    emoji: '✴️',
    description: 'eight-pointed star',
    category: 'Symbols',
    aliases: ['eight_pointed_black_star'],
    tags: []
  },
  {
    emoji: '❇️',
    description: 'sparkle',
    category: 'Symbols',
    aliases: ['sparkle'],
    tags: []
  },
  {
    emoji: '©️',
    description: 'copyright',
    category: 'Symbols',
    aliases: ['copyright'],
    tags: []
  },
  {
    emoji: '®️',
    description: 'registered',
    category: 'Symbols',
    aliases: ['registered'],
    tags: []
  },
  {
    emoji: '™️',
    description: 'trade mark',
    category: 'Symbols',
    aliases: ['tm'],
    tags: ['trademark']
  },
  {
    emoji: '#️⃣',
    description: 'keycap: #',
    category: 'Symbols',
    aliases: ['hash'],
    tags: ['number']
  },
  {
    emoji: '*️⃣',
    description: 'keycap: *',
    category: 'Symbols',
    aliases: ['asterisk'],
    tags: []
  },
  {
    emoji: '0️⃣',
    description: 'keycap: 0',
    category: 'Symbols',
    aliases: ['zero'],
    tags: []
  },
  {
    emoji: '1️⃣',
    description: 'keycap: 1',
    category: 'Symbols',
    aliases: ['one'],
    tags: []
  },
  {
    emoji: '2️⃣',
    description: 'keycap: 2',
    category: 'Symbols',
    aliases: ['two'],
    tags: []
  },
  {
    emoji: '3️⃣',
    description: 'keycap: 3',
    category: 'Symbols',
    aliases: ['three'],
    tags: []
  },
  {
    emoji: '4️⃣',
    description: 'keycap: 4',
    category: 'Symbols',
    aliases: ['four'],
    tags: []
  },
  {
    emoji: '5️⃣',
    description: 'keycap: 5',
    category: 'Symbols',
    aliases: ['five'],
    tags: []
  },
  {
    emoji: '6️⃣',
    description: 'keycap: 6',
    category: 'Symbols',
    aliases: ['six'],
    tags: []
  },
  {
    emoji: '7️⃣',
    description: 'keycap: 7',
    category: 'Symbols',
    aliases: ['seven'],
    tags: []
  },
  {
    emoji: '8️⃣',
    description: 'keycap: 8',
    category: 'Symbols',
    aliases: ['eight'],
    tags: []
  },
  {
    emoji: '9️⃣',
    description: 'keycap: 9',
    category: 'Symbols',
    aliases: ['nine'],
    tags: []
  },
  {
    emoji: '🔟',
    description: 'keycap: 10',
    category: 'Symbols',
    aliases: ['keycap_ten'],
    tags: []
  },
  {
    emoji: '🔠',
    description: 'input latin uppercase',
    category: 'Symbols',
    aliases: ['capital_abcd'],
    tags: ['letters']
  },
  {
    emoji: '🔡',
    description: 'input latin lowercase',
    category: 'Symbols',
    aliases: ['abcd'],
    tags: []
  },
  {
    emoji: '🔢',
    description: 'input numbers',
    category: 'Symbols',
    aliases: ['1234'],
    tags: ['numbers']
  },
  {
    emoji: '🔣',
    description: 'input symbols',
    category: 'Symbols',
    aliases: ['symbols'],
    tags: []
  },
  {
    emoji: '🔤',
    description: 'input latin letters',
    category: 'Symbols',
    aliases: ['abc'],
    tags: ['alphabet']
  },
  {
    emoji: '🅰️',
    description: 'A button (blood type)',
    category: 'Symbols',
    aliases: ['a'],
    tags: []
  },
  {
    emoji: '🆎',
    description: 'AB button (blood type)',
    category: 'Symbols',
    aliases: ['ab'],
    tags: []
  },
  {
    emoji: '🅱️',
    description: 'B button (blood type)',
    category: 'Symbols',
    aliases: ['b'],
    tags: []
  },
  {
    emoji: '🆑',
    description: 'CL button',
    category: 'Symbols',
    aliases: ['cl'],
    tags: []
  },
  {
    emoji: '🆒',
    description: 'COOL button',
    category: 'Symbols',
    aliases: ['cool'],
    tags: []
  },
  {
    emoji: '🆓',
    description: 'FREE button',
    category: 'Symbols',
    aliases: ['free'],
    tags: []
  },
  {
    emoji: 'ℹ️',
    description: 'information',
    category: 'Symbols',
    aliases: ['information_source'],
    tags: []
  },
  {
    emoji: '🆔',
    description: 'ID button',
    category: 'Symbols',
    aliases: ['id'],
    tags: []
  },
  {
    emoji: 'Ⓜ️',
    description: 'circled M',
    category: 'Symbols',
    aliases: ['m'],
    tags: []
  },
  {
    emoji: '🆕',
    description: 'NEW button',
    category: 'Symbols',
    aliases: ['new'],
    tags: ['fresh']
  },
  {
    emoji: '🆖',
    description: 'NG button',
    category: 'Symbols',
    aliases: ['ng'],
    tags: []
  },
  {
    emoji: '🅾️',
    description: 'O button (blood type)',
    category: 'Symbols',
    aliases: ['o2'],
    tags: []
  },
  {
    emoji: '🆗',
    description: 'OK button',
    category: 'Symbols',
    aliases: ['ok'],
    tags: ['yes']
  },
  {
    emoji: '🅿️',
    description: 'P button',
    category: 'Symbols',
    aliases: ['parking'],
    tags: []
  },
  {
    emoji: '🆘',
    description: 'SOS button',
    category: 'Symbols',
    aliases: ['sos'],
    tags: ['help', 'emergency']
  },
  {
    emoji: '🆙',
    description: 'UP! button',
    category: 'Symbols',
    aliases: ['up'],
    tags: []
  },
  {
    emoji: '🆚',
    description: 'VS button',
    category: 'Symbols',
    aliases: ['vs'],
    tags: []
  },
  {
    emoji: '🈁',
    description: 'Japanese “here” button',
    category: 'Symbols',
    aliases: ['koko'],
    tags: []
  },
  {
    emoji: '🈂️',
    description: 'Japanese “service charge” button',
    category: 'Symbols',
    aliases: ['sa'],
    tags: []
  },
  {
    emoji: '🈷️',
    description: 'Japanese “monthly amount” button',
    category: 'Symbols',
    aliases: ['u6708'],
    tags: []
  },
  {
    emoji: '🈶',
    description: 'Japanese “not free of charge” button',
    category: 'Symbols',
    aliases: ['u6709'],
    tags: []
  },
  {
    emoji: '🈯',
    description: 'Japanese “reserved” button',
    category: 'Symbols',
    aliases: ['u6307'],
    tags: []
  },
  {
    emoji: '🉐',
    description: 'Japanese “bargain” button',
    category: 'Symbols',
    aliases: ['ideograph_advantage'],
    tags: []
  },
  {
    emoji: '🈹',
    description: 'Japanese “discount” button',
    category: 'Symbols',
    aliases: ['u5272'],
    tags: []
  },
  {
    emoji: '🈚',
    description: 'Japanese “free of charge” button',
    category: 'Symbols',
    aliases: ['u7121'],
    tags: []
  },
  {
    emoji: '🈲',
    description: 'Japanese “prohibited” button',
    category: 'Symbols',
    aliases: ['u7981'],
    tags: []
  },
  {
    emoji: '🉑',
    description: 'Japanese “acceptable” button',
    category: 'Symbols',
    aliases: ['accept'],
    tags: []
  },
  {
    emoji: '🈸',
    description: 'Japanese “application” button',
    category: 'Symbols',
    aliases: ['u7533'],
    tags: []
  },
  {
    emoji: '🈴',
    description: 'Japanese “passing grade” button',
    category: 'Symbols',
    aliases: ['u5408'],
    tags: []
  },
  {
    emoji: '🈳',
    description: 'Japanese “vacancy” button',
    category: 'Symbols',
    aliases: ['u7a7a'],
    tags: []
  },
  {
    emoji: '㊗️',
    description: 'Japanese “congratulations” button',
    category: 'Symbols',
    aliases: ['congratulations'],
    tags: []
  },
  {
    emoji: '㊙️',
    description: 'Japanese “secret” button',
    category: 'Symbols',
    aliases: ['secret'],
    tags: []
  },
  {
    emoji: '🈺',
    description: 'Japanese “open for business” button',
    category: 'Symbols',
    aliases: ['u55b6'],
    tags: []
  },
  {
    emoji: '🈵',
    description: 'Japanese “no vacancy” button',
    category: 'Symbols',
    aliases: ['u6e80'],
    tags: []
  },
  {
    emoji: '🔴',
    description: 'red circle',
    category: 'Symbols',
    aliases: ['red_circle'],
    tags: []
  },
  {
    emoji: '🟠',
    description: 'orange circle',
    category: 'Symbols',
    aliases: ['orange_circle'],
    tags: []
  },
  {
    emoji: '🟡',
    description: 'yellow circle',
    category: 'Symbols',
    aliases: ['yellow_circle'],
    tags: []
  },
  {
    emoji: '🟢',
    description: 'green circle',
    category: 'Symbols',
    aliases: ['green_circle'],
    tags: []
  },
  {
    emoji: '🔵',
    description: 'blue circle',
    category: 'Symbols',
    aliases: ['large_blue_circle'],
    tags: []
  },
  {
    emoji: '🟣',
    description: 'purple circle',
    category: 'Symbols',
    aliases: ['purple_circle'],
    tags: []
  },
  {
    emoji: '🟤',
    description: 'brown circle',
    category: 'Symbols',
    aliases: ['brown_circle'],
    tags: []
  },
  {
    emoji: '⚫',
    description: 'black circle',
    category: 'Symbols',
    aliases: ['black_circle'],
    tags: []
  },
  {
    emoji: '⚪',
    description: 'white circle',
    category: 'Symbols',
    aliases: ['white_circle'],
    tags: []
  },
  {
    emoji: '🟥',
    description: 'red square',
    category: 'Symbols',
    aliases: ['red_square'],
    tags: []
  },
  {
    emoji: '🟧',
    description: 'orange square',
    category: 'Symbols',
    aliases: ['orange_square'],
    tags: []
  },
  {
    emoji: '🟨',
    description: 'yellow square',
    category: 'Symbols',
    aliases: ['yellow_square'],
    tags: []
  },
  {
    emoji: '🟩',
    description: 'green square',
    category: 'Symbols',
    aliases: ['green_square'],
    tags: []
  },
  {
    emoji: '🟦',
    description: 'blue square',
    category: 'Symbols',
    aliases: ['blue_square'],
    tags: []
  },
  {
    emoji: '🟪',
    description: 'purple square',
    category: 'Symbols',
    aliases: ['purple_square'],
    tags: []
  },
  {
    emoji: '🟫',
    description: 'brown square',
    category: 'Symbols',
    aliases: ['brown_square'],
    tags: []
  },
  {
    emoji: '⬛',
    description: 'black large square',
    category: 'Symbols',
    aliases: ['black_large_square'],
    tags: []
  },
  {
    emoji: '⬜',
    description: 'white large square',
    category: 'Symbols',
    aliases: ['white_large_square'],
    tags: []
  },
  {
    emoji: '◼️',
    description: 'black medium square',
    category: 'Symbols',
    aliases: ['black_medium_square'],
    tags: []
  },
  {
    emoji: '◻️',
    description: 'white medium square',
    category: 'Symbols',
    aliases: ['white_medium_square'],
    tags: []
  },
  {
    emoji: '◾',
    description: 'black medium-small square',
    category: 'Symbols',
    aliases: ['black_medium_small_square'],
    tags: []
  },
  {
    emoji: '◽',
    description: 'white medium-small square',
    category: 'Symbols',
    aliases: ['white_medium_small_square'],
    tags: []
  },
  {
    emoji: '▪️',
    description: 'black small square',
    category: 'Symbols',
    aliases: ['black_small_square'],
    tags: []
  },
  {
    emoji: '▫️',
    description: 'white small square',
    category: 'Symbols',
    aliases: ['white_small_square'],
    tags: []
  },
  {
    emoji: '🔶',
    description: 'large orange diamond',
    category: 'Symbols',
    aliases: ['large_orange_diamond'],
    tags: []
  },
  {
    emoji: '🔷',
    description: 'large blue diamond',
    category: 'Symbols',
    aliases: ['large_blue_diamond'],
    tags: []
  },
  {
    emoji: '🔸',
    description: 'small orange diamond',
    category: 'Symbols',
    aliases: ['small_orange_diamond'],
    tags: []
  },
  {
    emoji: '🔹',
    description: 'small blue diamond',
    category: 'Symbols',
    aliases: ['small_blue_diamond'],
    tags: []
  },
  {
    emoji: '🔺',
    description: 'red triangle pointed up',
    category: 'Symbols',
    aliases: ['small_red_triangle'],
    tags: []
  },
  {
    emoji: '🔻',
    description: 'red triangle pointed down',
    category: 'Symbols',
    aliases: ['small_red_triangle_down'],
    tags: []
  },
  {
    emoji: '💠',
    description: 'diamond with a dot',
    category: 'Symbols',
    aliases: ['diamond_shape_with_a_dot_inside'],
    tags: []
  },
  {
    emoji: '🔘',
    description: 'radio button',
    category: 'Symbols',
    aliases: ['radio_button'],
    tags: []
  },
  {
    emoji: '🔳',
    description: 'white square button',
    category: 'Symbols',
    aliases: ['white_square_button'],
    tags: []
  },
  {
    emoji: '🔲',
    description: 'black square button',
    category: 'Symbols',
    aliases: ['black_square_button'],
    tags: []
  },
  {
    emoji: '🏁',
    description: 'chequered flag',
    category: 'Flags',
    aliases: ['checkered_flag'],
    tags: ['milestone', 'finish']
  },
  {
    emoji: '🚩',
    description: 'triangular flag',
    category: 'Flags',
    aliases: ['triangular_flag_on_post'],
    tags: []
  },
  {
    emoji: '🎌',
    description: 'crossed flags',
    category: 'Flags',
    aliases: ['crossed_flags'],
    tags: []
  },
  {
    emoji: '🏴',
    description: 'black flag',
    category: 'Flags',
    aliases: ['black_flag'],
    tags: []
  },
  {
    emoji: '🏳️',
    description: 'white flag',
    category: 'Flags',
    aliases: ['white_flag'],
    tags: []
  },
  {
    emoji: '🏳️‍🌈',
    description: 'rainbow flag',
    category: 'Flags',
    aliases: ['rainbow_flag'],
    tags: ['pride']
  },
  {
    emoji: '🏳️‍⚧️',
    description: 'transgender flag',
    category: 'Flags',
    aliases: ['transgender_flag'],
    tags: []
  },
  {
    emoji: '🏴‍☠️',
    description: 'pirate flag',
    category: 'Flags',
    aliases: ['pirate_flag'],
    tags: []
  },
  {
    emoji: '🇦🇨',
    description: 'flag: Ascension Island',
    category: 'Flags',
    aliases: ['ascension_island'],
    tags: []
  },
  {
    emoji: '🇦🇩',
    description: 'flag: Andorra',
    category: 'Flags',
    aliases: ['andorra'],
    tags: []
  },
  {
    emoji: '🇦🇪',
    description: 'flag: United Arab Emirates',
    category: 'Flags',
    aliases: ['united_arab_emirates'],
    tags: []
  },
  {
    emoji: '🇦🇫',
    description: 'flag: Afghanistan',
    category: 'Flags',
    aliases: ['afghanistan'],
    tags: []
  },
  {
    emoji: '🇦🇬',
    description: 'flag: Antigua & Barbuda',
    category: 'Flags',
    aliases: ['antigua_barbuda'],
    tags: []
  },
  {
    emoji: '🇦🇮',
    description: 'flag: Anguilla',
    category: 'Flags',
    aliases: ['anguilla'],
    tags: []
  },
  {
    emoji: '🇦🇱',
    description: 'flag: Albania',
    category: 'Flags',
    aliases: ['albania'],
    tags: []
  },
  {
    emoji: '🇦🇲',
    description: 'flag: Armenia',
    category: 'Flags',
    aliases: ['armenia'],
    tags: []
  },
  {
    emoji: '🇦🇴',
    description: 'flag: Angola',
    category: 'Flags',
    aliases: ['angola'],
    tags: []
  },
  {
    emoji: '🇦🇶',
    description: 'flag: Antarctica',
    category: 'Flags',
    aliases: ['antarctica'],
    tags: []
  },
  {
    emoji: '🇦🇷',
    description: 'flag: Argentina',
    category: 'Flags',
    aliases: ['argentina'],
    tags: []
  },
  {
    emoji: '🇦🇸',
    description: 'flag: American Samoa',
    category: 'Flags',
    aliases: ['american_samoa'],
    tags: []
  },
  {
    emoji: '🇦🇹',
    description: 'flag: Austria',
    category: 'Flags',
    aliases: ['austria'],
    tags: []
  },
  {
    emoji: '🇦🇺',
    description: 'flag: Australia',
    category: 'Flags',
    aliases: ['australia'],
    tags: []
  },
  {
    emoji: '🇦🇼',
    description: 'flag: Aruba',
    category: 'Flags',
    aliases: ['aruba'],
    tags: []
  },
  {
    emoji: '🇦🇽',
    description: 'flag: Åland Islands',
    category: 'Flags',
    aliases: ['aland_islands'],
    tags: []
  },
  {
    emoji: '🇦🇿',
    description: 'flag: Azerbaijan',
    category: 'Flags',
    aliases: ['azerbaijan'],
    tags: []
  },
  {
    emoji: '🇧🇦',
    description: 'flag: Bosnia & Herzegovina',
    category: 'Flags',
    aliases: ['bosnia_herzegovina'],
    tags: []
  },
  {
    emoji: '🇧🇧',
    description: 'flag: Barbados',
    category: 'Flags',
    aliases: ['barbados'],
    tags: []
  },
  {
    emoji: '🇧🇩',
    description: 'flag: Bangladesh',
    category: 'Flags',
    aliases: ['bangladesh'],
    tags: []
  },
  {
    emoji: '🇧🇪',
    description: 'flag: Belgium',
    category: 'Flags',
    aliases: ['belgium'],
    tags: []
  },
  {
    emoji: '🇧🇫',
    description: 'flag: Burkina Faso',
    category: 'Flags',
    aliases: ['burkina_faso'],
    tags: []
  },
  {
    emoji: '🇧🇬',
    description: 'flag: Bulgaria',
    category: 'Flags',
    aliases: ['bulgaria'],
    tags: []
  },
  {
    emoji: '🇧🇭',
    description: 'flag: Bahrain',
    category: 'Flags',
    aliases: ['bahrain'],
    tags: []
  },
  {
    emoji: '🇧🇮',
    description: 'flag: Burundi',
    category: 'Flags',
    aliases: ['burundi'],
    tags: []
  },
  {
    emoji: '🇧🇯',
    description: 'flag: Benin',
    category: 'Flags',
    aliases: ['benin'],
    tags: []
  },
  {
    emoji: '🇧🇱',
    description: 'flag: St. Barthélemy',
    category: 'Flags',
    aliases: ['st_barthelemy'],
    tags: []
  },
  {
    emoji: '🇧🇲',
    description: 'flag: Bermuda',
    category: 'Flags',
    aliases: ['bermuda'],
    tags: []
  },
  {
    emoji: '🇧🇳',
    description: 'flag: Brunei',
    category: 'Flags',
    aliases: ['brunei'],
    tags: []
  },
  {
    emoji: '🇧🇴',
    description: 'flag: Bolivia',
    category: 'Flags',
    aliases: ['bolivia'],
    tags: []
  },
  {
    emoji: '🇧🇶',
    description: 'flag: Caribbean Netherlands',
    category: 'Flags',
    aliases: ['caribbean_netherlands'],
    tags: []
  },
  {
    emoji: '🇧🇷',
    description: 'flag: Brazil',
    category: 'Flags',
    aliases: ['brazil'],
    tags: []
  },
  {
    emoji: '🇧🇸',
    description: 'flag: Bahamas',
    category: 'Flags',
    aliases: ['bahamas'],
    tags: []
  },
  {
    emoji: '🇧🇹',
    description: 'flag: Bhutan',
    category: 'Flags',
    aliases: ['bhutan'],
    tags: []
  },
  {
    emoji: '🇧🇻',
    description: 'flag: Bouvet Island',
    category: 'Flags',
    aliases: ['bouvet_island'],
    tags: []
  },
  {
    emoji: '🇧🇼',
    description: 'flag: Botswana',
    category: 'Flags',
    aliases: ['botswana'],
    tags: []
  },
  {
    emoji: '🇧🇾',
    description: 'flag: Belarus',
    category: 'Flags',
    aliases: ['belarus'],
    tags: []
  },
  {
    emoji: '🇧🇿',
    description: 'flag: Belize',
    category: 'Flags',
    aliases: ['belize'],
    tags: []
  },
  {
    emoji: '🇨🇦',
    description: 'flag: Canada',
    category: 'Flags',
    aliases: ['canada'],
    tags: []
  },
  {
    emoji: '🇨🇨',
    description: 'flag: Cocos (Keeling) Islands',
    category: 'Flags',
    aliases: ['cocos_islands'],
    tags: ['keeling']
  },
  {
    emoji: '🇨🇩',
    description: 'flag: Congo - Kinshasa',
    category: 'Flags',
    aliases: ['congo_kinshasa'],
    tags: []
  },
  {
    emoji: '🇨🇫',
    description: 'flag: Central African Republic',
    category: 'Flags',
    aliases: ['central_african_republic'],
    tags: []
  },
  {
    emoji: '🇨🇬',
    description: 'flag: Congo - Brazzaville',
    category: 'Flags',
    aliases: ['congo_brazzaville'],
    tags: []
  },
  {
    emoji: '🇨🇭',
    description: 'flag: Switzerland',
    category: 'Flags',
    aliases: ['switzerland'],
    tags: []
  },
  {
    emoji: '🇨🇮',
    description: 'flag: Côte d’Ivoire',
    category: 'Flags',
    aliases: ['cote_divoire'],
    tags: ['ivory']
  },
  {
    emoji: '🇨🇰',
    description: 'flag: Cook Islands',
    category: 'Flags',
    aliases: ['cook_islands'],
    tags: []
  },
  {
    emoji: '🇨🇱',
    description: 'flag: Chile',
    category: 'Flags',
    aliases: ['chile'],
    tags: []
  },
  {
    emoji: '🇨🇲',
    description: 'flag: Cameroon',
    category: 'Flags',
    aliases: ['cameroon'],
    tags: []
  },
  {
    emoji: '🇨🇳',
    description: 'flag: China',
    category: 'Flags',
    aliases: ['cn'],
    tags: ['china']
  },
  {
    emoji: '🇨🇴',
    description: 'flag: Colombia',
    category: 'Flags',
    aliases: ['colombia'],
    tags: []
  },
  {
    emoji: '🇨🇵',
    description: 'flag: Clipperton Island',
    category: 'Flags',
    aliases: ['clipperton_island'],
    tags: []
  },
  {
    emoji: '🇨🇷',
    description: 'flag: Costa Rica',
    category: 'Flags',
    aliases: ['costa_rica'],
    tags: []
  },
  {
    emoji: '🇨🇺',
    description: 'flag: Cuba',
    category: 'Flags',
    aliases: ['cuba'],
    tags: []
  },
  {
    emoji: '🇨🇻',
    description: 'flag: Cape Verde',
    category: 'Flags',
    aliases: ['cape_verde'],
    tags: []
  },
  {
    emoji: '🇨🇼',
    description: 'flag: Curaçao',
    category: 'Flags',
    aliases: ['curacao'],
    tags: []
  },
  {
    emoji: '🇨🇽',
    description: 'flag: Christmas Island',
    category: 'Flags',
    aliases: ['christmas_island'],
    tags: []
  },
  {
    emoji: '🇨🇾',
    description: 'flag: Cyprus',
    category: 'Flags',
    aliases: ['cyprus'],
    tags: []
  },
  {
    emoji: '🇨🇿',
    description: 'flag: Czechia',
    category: 'Flags',
    aliases: ['czech_republic'],
    tags: []
  },
  {
    emoji: '🇩🇪',
    description: 'flag: Germany',
    category: 'Flags',
    aliases: ['de'],
    tags: ['flag', 'germany']
  },
  {
    emoji: '🇩🇬',
    description: 'flag: Diego Garcia',
    category: 'Flags',
    aliases: ['diego_garcia'],
    tags: []
  },
  {
    emoji: '🇩🇯',
    description: 'flag: Djibouti',
    category: 'Flags',
    aliases: ['djibouti'],
    tags: []
  },
  {
    emoji: '🇩🇰',
    description: 'flag: Denmark',
    category: 'Flags',
    aliases: ['denmark'],
    tags: []
  },
  {
    emoji: '🇩🇲',
    description: 'flag: Dominica',
    category: 'Flags',
    aliases: ['dominica'],
    tags: []
  },
  {
    emoji: '🇩🇴',
    description: 'flag: Dominican Republic',
    category: 'Flags',
    aliases: ['dominican_republic'],
    tags: []
  },
  {
    emoji: '🇩🇿',
    description: 'flag: Algeria',
    category: 'Flags',
    aliases: ['algeria'],
    tags: []
  },
  {
    emoji: '🇪🇦',
    description: 'flag: Ceuta & Melilla',
    category: 'Flags',
    aliases: ['ceuta_melilla'],
    tags: []
  },
  {
    emoji: '🇪🇨',
    description: 'flag: Ecuador',
    category: 'Flags',
    aliases: ['ecuador'],
    tags: []
  },
  {
    emoji: '🇪🇪',
    description: 'flag: Estonia',
    category: 'Flags',
    aliases: ['estonia'],
    tags: []
  },
  {
    emoji: '🇪🇬',
    description: 'flag: Egypt',
    category: 'Flags',
    aliases: ['egypt'],
    tags: []
  },
  {
    emoji: '🇪🇭',
    description: 'flag: Western Sahara',
    category: 'Flags',
    aliases: ['western_sahara'],
    tags: []
  },
  {
    emoji: '🇪🇷',
    description: 'flag: Eritrea',
    category: 'Flags',
    aliases: ['eritrea'],
    tags: []
  },
  {
    emoji: '🇪🇸',
    description: 'flag: Spain',
    category: 'Flags',
    aliases: ['es'],
    tags: ['spain']
  },
  {
    emoji: '🇪🇹',
    description: 'flag: Ethiopia',
    category: 'Flags',
    aliases: ['ethiopia'],
    tags: []
  },
  {
    emoji: '🇪🇺',
    description: 'flag: European Union',
    category: 'Flags',
    aliases: ['eu', 'european_union'],
    tags: []
  },
  {
    emoji: '🇫🇮',
    description: 'flag: Finland',
    category: 'Flags',
    aliases: ['finland'],
    tags: []
  },
  {
    emoji: '🇫🇯',
    description: 'flag: Fiji',
    category: 'Flags',
    aliases: ['fiji'],
    tags: []
  },
  {
    emoji: '🇫🇰',
    description: 'flag: Falkland Islands',
    category: 'Flags',
    aliases: ['falkland_islands'],
    tags: []
  },
  {
    emoji: '🇫🇲',
    description: 'flag: Micronesia',
    category: 'Flags',
    aliases: ['micronesia'],
    tags: []
  },
  {
    emoji: '🇫🇴',
    description: 'flag: Faroe Islands',
    category: 'Flags',
    aliases: ['faroe_islands'],
    tags: []
  },
  {
    emoji: '🇫🇷',
    description: 'flag: France',
    category: 'Flags',
    aliases: ['fr'],
    tags: ['france', 'french']
  },
  {
    emoji: '🇬🇦',
    description: 'flag: Gabon',
    category: 'Flags',
    aliases: ['gabon'],
    tags: []
  },
  {
    emoji: '🇬🇧',
    description: 'flag: United Kingdom',
    category: 'Flags',
    aliases: ['gb', 'uk'],
    tags: ['flag', 'british']
  },
  {
    emoji: '🇬🇩',
    description: 'flag: Grenada',
    category: 'Flags',
    aliases: ['grenada'],
    tags: []
  },
  {
    emoji: '🇬🇪',
    description: 'flag: Georgia',
    category: 'Flags',
    aliases: ['georgia'],
    tags: []
  },
  {
    emoji: '🇬🇫',
    description: 'flag: French Guiana',
    category: 'Flags',
    aliases: ['french_guiana'],
    tags: []
  },
  {
    emoji: '🇬🇬',
    description: 'flag: Guernsey',
    category: 'Flags',
    aliases: ['guernsey'],
    tags: []
  },
  {
    emoji: '🇬🇭',
    description: 'flag: Ghana',
    category: 'Flags',
    aliases: ['ghana'],
    tags: []
  },
  {
    emoji: '🇬🇮',
    description: 'flag: Gibraltar',
    category: 'Flags',
    aliases: ['gibraltar'],
    tags: []
  },
  {
    emoji: '🇬🇱',
    description: 'flag: Greenland',
    category: 'Flags',
    aliases: ['greenland'],
    tags: []
  },
  {
    emoji: '🇬🇲',
    description: 'flag: Gambia',
    category: 'Flags',
    aliases: ['gambia'],
    tags: []
  },
  {
    emoji: '🇬🇳',
    description: 'flag: Guinea',
    category: 'Flags',
    aliases: ['guinea'],
    tags: []
  },
  {
    emoji: '🇬🇵',
    description: 'flag: Guadeloupe',
    category: 'Flags',
    aliases: ['guadeloupe'],
    tags: []
  },
  {
    emoji: '🇬🇶',
    description: 'flag: Equatorial Guinea',
    category: 'Flags',
    aliases: ['equatorial_guinea'],
    tags: []
  },
  {
    emoji: '🇬🇷',
    description: 'flag: Greece',
    category: 'Flags',
    aliases: ['greece'],
    tags: []
  },
  {
    emoji: '🇬🇸',
    description: 'flag: South Georgia & South Sandwich Islands',
    category: 'Flags',
    aliases: ['south_georgia_south_sandwich_islands'],
    tags: []
  },
  {
    emoji: '🇬🇹',
    description: 'flag: Guatemala',
    category: 'Flags',
    aliases: ['guatemala'],
    tags: []
  },
  {
    emoji: '🇬🇺',
    description: 'flag: Guam',
    category: 'Flags',
    aliases: ['guam'],
    tags: []
  },
  {
    emoji: '🇬🇼',
    description: 'flag: Guinea-Bissau',
    category: 'Flags',
    aliases: ['guinea_bissau'],
    tags: []
  },
  {
    emoji: '🇬🇾',
    description: 'flag: Guyana',
    category: 'Flags',
    aliases: ['guyana'],
    tags: []
  },
  {
    emoji: '🇭🇰',
    description: 'flag: Hong Kong SAR China',
    category: 'Flags',
    aliases: ['hong_kong'],
    tags: []
  },
  {
    emoji: '🇭🇲',
    description: 'flag: Heard & McDonald Islands',
    category: 'Flags',
    aliases: ['heard_mcdonald_islands'],
    tags: []
  },
  {
    emoji: '🇭🇳',
    description: 'flag: Honduras',
    category: 'Flags',
    aliases: ['honduras'],
    tags: []
  },
  {
    emoji: '🇭🇷',
    description: 'flag: Croatia',
    category: 'Flags',
    aliases: ['croatia'],
    tags: []
  },
  {
    emoji: '🇭🇹',
    description: 'flag: Haiti',
    category: 'Flags',
    aliases: ['haiti'],
    tags: []
  },
  {
    emoji: '🇭🇺',
    description: 'flag: Hungary',
    category: 'Flags',
    aliases: ['hungary'],
    tags: []
  },
  {
    emoji: '🇮🇨',
    description: 'flag: Canary Islands',
    category: 'Flags',
    aliases: ['canary_islands'],
    tags: []
  },
  {
    emoji: '🇮🇩',
    description: 'flag: Indonesia',
    category: 'Flags',
    aliases: ['indonesia'],
    tags: []
  },
  {
    emoji: '🇮🇪',
    description: 'flag: Ireland',
    category: 'Flags',
    aliases: ['ireland'],
    tags: []
  },
  {
    emoji: '🇮🇱',
    description: 'flag: Israel',
    category: 'Flags',
    aliases: ['israel'],
    tags: []
  },
  {
    emoji: '🇮🇲',
    description: 'flag: Isle of Man',
    category: 'Flags',
    aliases: ['isle_of_man'],
    tags: []
  },
  {
    emoji: '🇮🇳',
    description: 'flag: India',
    category: 'Flags',
    aliases: ['india'],
    tags: []
  },
  {
    emoji: '🇮🇴',
    description: 'flag: British Indian Ocean Territory',
    category: 'Flags',
    aliases: ['british_indian_ocean_territory'],
    tags: []
  },
  {
    emoji: '🇮🇶',
    description: 'flag: Iraq',
    category: 'Flags',
    aliases: ['iraq'],
    tags: []
  },
  {
    emoji: '🇮🇷',
    description: 'flag: Iran',
    category: 'Flags',
    aliases: ['iran'],
    tags: []
  },
  {
    emoji: '🇮🇸',
    description: 'flag: Iceland',
    category: 'Flags',
    aliases: ['iceland'],
    tags: []
  },
  {
    emoji: '🇮🇹',
    description: 'flag: Italy',
    category: 'Flags',
    aliases: ['it'],
    tags: ['italy']
  },
  {
    emoji: '🇯🇪',
    description: 'flag: Jersey',
    category: 'Flags',
    aliases: ['jersey'],
    tags: []
  },
  {
    emoji: '🇯🇲',
    description: 'flag: Jamaica',
    category: 'Flags',
    aliases: ['jamaica'],
    tags: []
  },
  {
    emoji: '🇯🇴',
    description: 'flag: Jordan',
    category: 'Flags',
    aliases: ['jordan'],
    tags: []
  },
  {
    emoji: '🇯🇵',
    description: 'flag: Japan',
    category: 'Flags',
    aliases: ['jp'],
    tags: ['japan']
  },
  {
    emoji: '🇰🇪',
    description: 'flag: Kenya',
    category: 'Flags',
    aliases: ['kenya'],
    tags: []
  },
  {
    emoji: '🇰🇬',
    description: 'flag: Kyrgyzstan',
    category: 'Flags',
    aliases: ['kyrgyzstan'],
    tags: []
  },
  {
    emoji: '🇰🇭',
    description: 'flag: Cambodia',
    category: 'Flags',
    aliases: ['cambodia'],
    tags: []
  },
  {
    emoji: '🇰🇮',
    description: 'flag: Kiribati',
    category: 'Flags',
    aliases: ['kiribati'],
    tags: []
  },
  {
    emoji: '🇰🇲',
    description: 'flag: Comoros',
    category: 'Flags',
    aliases: ['comoros'],
    tags: []
  },
  {
    emoji: '🇰🇳',
    description: 'flag: St. Kitts & Nevis',
    category: 'Flags',
    aliases: ['st_kitts_nevis'],
    tags: []
  },
  {
    emoji: '🇰🇵',
    description: 'flag: North Korea',
    category: 'Flags',
    aliases: ['north_korea'],
    tags: []
  },
  {
    emoji: '🇰🇷',
    description: 'flag: South Korea',
    category: 'Flags',
    aliases: ['kr'],
    tags: ['korea']
  },
  {
    emoji: '🇰🇼',
    description: 'flag: Kuwait',
    category: 'Flags',
    aliases: ['kuwait'],
    tags: []
  },
  {
    emoji: '🇰🇾',
    description: 'flag: Cayman Islands',
    category: 'Flags',
    aliases: ['cayman_islands'],
    tags: []
  },
  {
    emoji: '🇰🇿',
    description: 'flag: Kazakhstan',
    category: 'Flags',
    aliases: ['kazakhstan'],
    tags: []
  },
  {
    emoji: '🇱🇦',
    description: 'flag: Laos',
    category: 'Flags',
    aliases: ['laos'],
    tags: []
  },
  {
    emoji: '🇱🇧',
    description: 'flag: Lebanon',
    category: 'Flags',
    aliases: ['lebanon'],
    tags: []
  },
  {
    emoji: '🇱🇨',
    description: 'flag: St. Lucia',
    category: 'Flags',
    aliases: ['st_lucia'],
    tags: []
  },
  {
    emoji: '🇱🇮',
    description: 'flag: Liechtenstein',
    category: 'Flags',
    aliases: ['liechtenstein'],
    tags: []
  },
  {
    emoji: '🇱🇰',
    description: 'flag: Sri Lanka',
    category: 'Flags',
    aliases: ['sri_lanka'],
    tags: []
  },
  {
    emoji: '🇱🇷',
    description: 'flag: Liberia',
    category: 'Flags',
    aliases: ['liberia'],
    tags: []
  },
  {
    emoji: '🇱🇸',
    description: 'flag: Lesotho',
    category: 'Flags',
    aliases: ['lesotho'],
    tags: []
  },
  {
    emoji: '🇱🇹',
    description: 'flag: Lithuania',
    category: 'Flags',
    aliases: ['lithuania'],
    tags: []
  },
  {
    emoji: '🇱🇺',
    description: 'flag: Luxembourg',
    category: 'Flags',
    aliases: ['luxembourg'],
    tags: []
  },
  {
    emoji: '🇱🇻',
    description: 'flag: Latvia',
    category: 'Flags',
    aliases: ['latvia'],
    tags: []
  },
  {
    emoji: '🇱🇾',
    description: 'flag: Libya',
    category: 'Flags',
    aliases: ['libya'],
    tags: []
  },
  {
    emoji: '🇲🇦',
    description: 'flag: Morocco',
    category: 'Flags',
    aliases: ['morocco'],
    tags: []
  },
  {
    emoji: '🇲🇨',
    description: 'flag: Monaco',
    category: 'Flags',
    aliases: ['monaco'],
    tags: []
  },
  {
    emoji: '🇲🇩',
    description: 'flag: Moldova',
    category: 'Flags',
    aliases: ['moldova'],
    tags: []
  },
  {
    emoji: '🇲🇪',
    description: 'flag: Montenegro',
    category: 'Flags',
    aliases: ['montenegro'],
    tags: []
  },
  {
    emoji: '🇲🇫',
    description: 'flag: St. Martin',
    category: 'Flags',
    aliases: ['st_martin'],
    tags: []
  },
  {
    emoji: '🇲🇬',
    description: 'flag: Madagascar',
    category: 'Flags',
    aliases: ['madagascar'],
    tags: []
  },
  {
    emoji: '🇲🇭',
    description: 'flag: Marshall Islands',
    category: 'Flags',
    aliases: ['marshall_islands'],
    tags: []
  },
  {
    emoji: '🇲🇰',
    description: 'flag: North Macedonia',
    category: 'Flags',
    aliases: ['macedonia'],
    tags: []
  },
  {
    emoji: '🇲🇱',
    description: 'flag: Mali',
    category: 'Flags',
    aliases: ['mali'],
    tags: []
  },
  {
    emoji: '🇲🇲',
    description: 'flag: Myanmar (Burma)',
    category: 'Flags',
    aliases: ['myanmar'],
    tags: ['burma']
  },
  {
    emoji: '🇲🇳',
    description: 'flag: Mongolia',
    category: 'Flags',
    aliases: ['mongolia'],
    tags: []
  },
  {
    emoji: '🇲🇴',
    description: 'flag: Macao SAR China',
    category: 'Flags',
    aliases: ['macau'],
    tags: []
  },
  {
    emoji: '🇲🇵',
    description: 'flag: Northern Mariana Islands',
    category: 'Flags',
    aliases: ['northern_mariana_islands'],
    tags: []
  },
  {
    emoji: '🇲🇶',
    description: 'flag: Martinique',
    category: 'Flags',
    aliases: ['martinique'],
    tags: []
  },
  {
    emoji: '🇲🇷',
    description: 'flag: Mauritania',
    category: 'Flags',
    aliases: ['mauritania'],
    tags: []
  },
  {
    emoji: '🇲🇸',
    description: 'flag: Montserrat',
    category: 'Flags',
    aliases: ['montserrat'],
    tags: []
  },
  {
    emoji: '🇲🇹',
    description: 'flag: Malta',
    category: 'Flags',
    aliases: ['malta'],
    tags: []
  },
  {
    emoji: '🇲🇺',
    description: 'flag: Mauritius',
    category: 'Flags',
    aliases: ['mauritius'],
    tags: []
  },
  {
    emoji: '🇲🇻',
    description: 'flag: Maldives',
    category: 'Flags',
    aliases: ['maldives'],
    tags: []
  },
  {
    emoji: '🇲🇼',
    description: 'flag: Malawi',
    category: 'Flags',
    aliases: ['malawi'],
    tags: []
  },
  {
    emoji: '🇲🇽',
    description: 'flag: Mexico',
    category: 'Flags',
    aliases: ['mexico'],
    tags: []
  },
  {
    emoji: '🇲🇾',
    description: 'flag: Malaysia',
    category: 'Flags',
    aliases: ['malaysia'],
    tags: []
  },
  {
    emoji: '🇲🇿',
    description: 'flag: Mozambique',
    category: 'Flags',
    aliases: ['mozambique'],
    tags: []
  },
  {
    emoji: '🇳🇦',
    description: 'flag: Namibia',
    category: 'Flags',
    aliases: ['namibia'],
    tags: []
  },
  {
    emoji: '🇳🇨',
    description: 'flag: New Caledonia',
    category: 'Flags',
    aliases: ['new_caledonia'],
    tags: []
  },
  {
    emoji: '🇳🇪',
    description: 'flag: Niger',
    category: 'Flags',
    aliases: ['niger'],
    tags: []
  },
  {
    emoji: '🇳🇫',
    description: 'flag: Norfolk Island',
    category: 'Flags',
    aliases: ['norfolk_island'],
    tags: []
  },
  {
    emoji: '🇳🇬',
    description: 'flag: Nigeria',
    category: 'Flags',
    aliases: ['nigeria'],
    tags: []
  },
  {
    emoji: '🇳🇮',
    description: 'flag: Nicaragua',
    category: 'Flags',
    aliases: ['nicaragua'],
    tags: []
  },
  {
    emoji: '🇳🇱',
    description: 'flag: Netherlands',
    category: 'Flags',
    aliases: ['netherlands'],
    tags: []
  },
  {
    emoji: '🇳🇴',
    description: 'flag: Norway',
    category: 'Flags',
    aliases: ['norway'],
    tags: []
  },
  {
    emoji: '🇳🇵',
    description: 'flag: Nepal',
    category: 'Flags',
    aliases: ['nepal'],
    tags: []
  },
  {
    emoji: '🇳🇷',
    description: 'flag: Nauru',
    category: 'Flags',
    aliases: ['nauru'],
    tags: []
  },
  {
    emoji: '🇳🇺',
    description: 'flag: Niue',
    category: 'Flags',
    aliases: ['niue'],
    tags: []
  },
  {
    emoji: '🇳🇿',
    description: 'flag: New Zealand',
    category: 'Flags',
    aliases: ['new_zealand'],
    tags: []
  },
  {
    emoji: '🇴🇲',
    description: 'flag: Oman',
    category: 'Flags',
    aliases: ['oman'],
    tags: []
  },
  {
    emoji: '🇵🇦',
    description: 'flag: Panama',
    category: 'Flags',
    aliases: ['panama'],
    tags: []
  },
  {
    emoji: '🇵🇪',
    description: 'flag: Peru',
    category: 'Flags',
    aliases: ['peru'],
    tags: []
  },
  {
    emoji: '🇵🇫',
    description: 'flag: French Polynesia',
    category: 'Flags',
    aliases: ['french_polynesia'],
    tags: []
  },
  {
    emoji: '🇵🇬',
    description: 'flag: Papua New Guinea',
    category: 'Flags',
    aliases: ['papua_new_guinea'],
    tags: []
  },
  {
    emoji: '🇵🇭',
    description: 'flag: Philippines',
    category: 'Flags',
    aliases: ['philippines'],
    tags: []
  },
  {
    emoji: '🇵🇰',
    description: 'flag: Pakistan',
    category: 'Flags',
    aliases: ['pakistan'],
    tags: []
  },
  {
    emoji: '🇵🇱',
    description: 'flag: Poland',
    category: 'Flags',
    aliases: ['poland'],
    tags: []
  },
  {
    emoji: '🇵🇲',
    description: 'flag: St. Pierre & Miquelon',
    category: 'Flags',
    aliases: ['st_pierre_miquelon'],
    tags: []
  },
  {
    emoji: '🇵🇳',
    description: 'flag: Pitcairn Islands',
    category: 'Flags',
    aliases: ['pitcairn_islands'],
    tags: []
  },
  {
    emoji: '🇵🇷',
    description: 'flag: Puerto Rico',
    category: 'Flags',
    aliases: ['puerto_rico'],
    tags: []
  },
  {
    emoji: '🇵🇸',
    description: 'flag: Palestinian Territories',
    category: 'Flags',
    aliases: ['palestinian_territories'],
    tags: []
  },
  {
    emoji: '🇵🇹',
    description: 'flag: Portugal',
    category: 'Flags',
    aliases: ['portugal'],
    tags: []
  },
  {
    emoji: '🇵🇼',
    description: 'flag: Palau',
    category: 'Flags',
    aliases: ['palau'],
    tags: []
  },
  {
    emoji: '🇵🇾',
    description: 'flag: Paraguay',
    category: 'Flags',
    aliases: ['paraguay'],
    tags: []
  },
  {
    emoji: '🇶🇦',
    description: 'flag: Qatar',
    category: 'Flags',
    aliases: ['qatar'],
    tags: []
  },
  {
    emoji: '🇷🇪',
    description: 'flag: Réunion',
    category: 'Flags',
    aliases: ['reunion'],
    tags: []
  },
  {
    emoji: '🇷🇴',
    description: 'flag: Romania',
    category: 'Flags',
    aliases: ['romania'],
    tags: []
  },
  {
    emoji: '🇷🇸',
    description: 'flag: Serbia',
    category: 'Flags',
    aliases: ['serbia'],
    tags: []
  },
  {
    emoji: '🇷🇺',
    description: 'flag: Russia',
    category: 'Flags',
    aliases: ['ru'],
    tags: ['russia']
  },
  {
    emoji: '🇷🇼',
    description: 'flag: Rwanda',
    category: 'Flags',
    aliases: ['rwanda'],
    tags: []
  },
  {
    emoji: '🇸🇦',
    description: 'flag: Saudi Arabia',
    category: 'Flags',
    aliases: ['saudi_arabia'],
    tags: []
  },
  {
    emoji: '🇸🇧',
    description: 'flag: Solomon Islands',
    category: 'Flags',
    aliases: ['solomon_islands'],
    tags: []
  },
  {
    emoji: '🇸🇨',
    description: 'flag: Seychelles',
    category: 'Flags',
    aliases: ['seychelles'],
    tags: []
  },
  {
    emoji: '🇸🇩',
    description: 'flag: Sudan',
    category: 'Flags',
    aliases: ['sudan'],
    tags: []
  },
  {
    emoji: '🇸🇪',
    description: 'flag: Sweden',
    category: 'Flags',
    aliases: ['sweden'],
    tags: []
  },
  {
    emoji: '🇸🇬',
    description: 'flag: Singapore',
    category: 'Flags',
    aliases: ['singapore'],
    tags: []
  },
  {
    emoji: '🇸🇭',
    description: 'flag: St. Helena',
    category: 'Flags',
    aliases: ['st_helena'],
    tags: []
  },
  {
    emoji: '🇸🇮',
    description: 'flag: Slovenia',
    category: 'Flags',
    aliases: ['slovenia'],
    tags: []
  },
  {
    emoji: '🇸🇯',
    description: 'flag: Svalbard & Jan Mayen',
    category: 'Flags',
    aliases: ['svalbard_jan_mayen'],
    tags: []
  },
  {
    emoji: '🇸🇰',
    description: 'flag: Slovakia',
    category: 'Flags',
    aliases: ['slovakia'],
    tags: []
  },
  {
    emoji: '🇸🇱',
    description: 'flag: Sierra Leone',
    category: 'Flags',
    aliases: ['sierra_leone'],
    tags: []
  },
  {
    emoji: '🇸🇲',
    description: 'flag: San Marino',
    category: 'Flags',
    aliases: ['san_marino'],
    tags: []
  },
  {
    emoji: '🇸🇳',
    description: 'flag: Senegal',
    category: 'Flags',
    aliases: ['senegal'],
    tags: []
  },
  {
    emoji: '🇸🇴',
    description: 'flag: Somalia',
    category: 'Flags',
    aliases: ['somalia'],
    tags: []
  },
  {
    emoji: '🇸🇷',
    description: 'flag: Suriname',
    category: 'Flags',
    aliases: ['suriname'],
    tags: []
  },
  {
    emoji: '🇸🇸',
    description: 'flag: South Sudan',
    category: 'Flags',
    aliases: ['south_sudan'],
    tags: []
  },
  {
    emoji: '🇸🇹',
    description: 'flag: São Tomé & Príncipe',
    category: 'Flags',
    aliases: ['sao_tome_principe'],
    tags: []
  },
  {
    emoji: '🇸🇻',
    description: 'flag: El Salvador',
    category: 'Flags',
    aliases: ['el_salvador'],
    tags: []
  },
  {
    emoji: '🇸🇽',
    description: 'flag: Sint Maarten',
    category: 'Flags',
    aliases: ['sint_maarten'],
    tags: []
  },
  {
    emoji: '🇸🇾',
    description: 'flag: Syria',
    category: 'Flags',
    aliases: ['syria'],
    tags: []
  },
  {
    emoji: '🇸🇿',
    description: 'flag: Eswatini',
    category: 'Flags',
    aliases: ['swaziland'],
    tags: []
  },
  {
    emoji: '🇹🇦',
    description: 'flag: Tristan da Cunha',
    category: 'Flags',
    aliases: ['tristan_da_cunha'],
    tags: []
  },
  {
    emoji: '🇹🇨',
    description: 'flag: Turks & Caicos Islands',
    category: 'Flags',
    aliases: ['turks_caicos_islands'],
    tags: []
  },
  {
    emoji: '🇹🇩',
    description: 'flag: Chad',
    category: 'Flags',
    aliases: ['chad'],
    tags: []
  },
  {
    emoji: '🇹🇫',
    description: 'flag: French Southern Territories',
    category: 'Flags',
    aliases: ['french_southern_territories'],
    tags: []
  },
  {
    emoji: '🇹🇬',
    description: 'flag: Togo',
    category: 'Flags',
    aliases: ['togo'],
    tags: []
  },
  {
    emoji: '🇹🇭',
    description: 'flag: Thailand',
    category: 'Flags',
    aliases: ['thailand'],
    tags: []
  },
  {
    emoji: '🇹🇯',
    description: 'flag: Tajikistan',
    category: 'Flags',
    aliases: ['tajikistan'],
    tags: []
  },
  {
    emoji: '🇹🇰',
    description: 'flag: Tokelau',
    category: 'Flags',
    aliases: ['tokelau'],
    tags: []
  },
  {
    emoji: '🇹🇱',
    description: 'flag: Timor-Leste',
    category: 'Flags',
    aliases: ['timor_leste'],
    tags: []
  },
  {
    emoji: '🇹🇲',
    description: 'flag: Turkmenistan',
    category: 'Flags',
    aliases: ['turkmenistan'],
    tags: []
  },
  {
    emoji: '🇹🇳',
    description: 'flag: Tunisia',
    category: 'Flags',
    aliases: ['tunisia'],
    tags: []
  },
  {
    emoji: '🇹🇴',
    description: 'flag: Tonga',
    category: 'Flags',
    aliases: ['tonga'],
    tags: []
  },
  {
    emoji: '🇹🇷',
    description: 'flag: Turkey',
    category: 'Flags',
    aliases: ['tr'],
    tags: ['turkey']
  },
  {
    emoji: '🇹🇹',
    description: 'flag: Trinidad & Tobago',
    category: 'Flags',
    aliases: ['trinidad_tobago'],
    tags: []
  },
  {
    emoji: '🇹🇻',
    description: 'flag: Tuvalu',
    category: 'Flags',
    aliases: ['tuvalu'],
    tags: []
  },
  {
    emoji: '🇹🇼',
    description: 'flag: Taiwan',
    category: 'Flags',
    aliases: ['taiwan'],
    tags: []
  },
  {
    emoji: '🇹🇿',
    description: 'flag: Tanzania',
    category: 'Flags',
    aliases: ['tanzania'],
    tags: []
  },
  {
    emoji: '🇺🇦',
    description: 'flag: Ukraine',
    category: 'Flags',
    aliases: ['ukraine'],
    tags: []
  },
  {
    emoji: '🇺🇬',
    description: 'flag: Uganda',
    category: 'Flags',
    aliases: ['uganda'],
    tags: []
  },
  {
    emoji: '🇺🇲',
    description: 'flag: U.S. Outlying Islands',
    category: 'Flags',
    aliases: ['us_outlying_islands'],
    tags: []
  },
  {
    emoji: '🇺🇳',
    description: 'flag: United Nations',
    category: 'Flags',
    aliases: ['united_nations'],
    tags: []
  },
  {
    emoji: '🇺🇸',
    description: 'flag: United States',
    category: 'Flags',
    aliases: ['us'],
    tags: ['flag', 'united', 'america']
  },
  {
    emoji: '🇺🇾',
    description: 'flag: Uruguay',
    category: 'Flags',
    aliases: ['uruguay'],
    tags: []
  },
  {
    emoji: '🇺🇿',
    description: 'flag: Uzbekistan',
    category: 'Flags',
    aliases: ['uzbekistan'],
    tags: []
  },
  {
    emoji: '🇻🇦',
    description: 'flag: Vatican City',
    category: 'Flags',
    aliases: ['vatican_city'],
    tags: []
  },
  {
    emoji: '🇻🇨',
    description: 'flag: St. Vincent & Grenadines',
    category: 'Flags',
    aliases: ['st_vincent_grenadines'],
    tags: []
  },
  {
    emoji: '🇻🇪',
    description: 'flag: Venezuela',
    category: 'Flags',
    aliases: ['venezuela'],
    tags: []
  },
  {
    emoji: '🇻🇬',
    description: 'flag: British Virgin Islands',
    category: 'Flags',
    aliases: ['british_virgin_islands'],
    tags: []
  },
  {
    emoji: '🇻🇮',
    description: 'flag: U.S. Virgin Islands',
    category: 'Flags',
    aliases: ['us_virgin_islands'],
    tags: []
  },
  {
    emoji: '🇻🇳',
    description: 'flag: Vietnam',
    category: 'Flags',
    aliases: ['vietnam'],
    tags: []
  },
  {
    emoji: '🇻🇺',
    description: 'flag: Vanuatu',
    category: 'Flags',
    aliases: ['vanuatu'],
    tags: []
  },
  {
    emoji: '🇼🇫',
    description: 'flag: Wallis & Futuna',
    category: 'Flags',
    aliases: ['wallis_futuna'],
    tags: []
  },
  {
    emoji: '🇼🇸',
    description: 'flag: Samoa',
    category: 'Flags',
    aliases: ['samoa'],
    tags: []
  },
  {
    emoji: '🇽🇰',
    description: 'flag: Kosovo',
    category: 'Flags',
    aliases: ['kosovo'],
    tags: []
  },
  {
    emoji: '🇾🇪',
    description: 'flag: Yemen',
    category: 'Flags',
    aliases: ['yemen'],
    tags: []
  },
  {
    emoji: '🇾🇹',
    description: 'flag: Mayotte',
    category: 'Flags',
    aliases: ['mayotte'],
    tags: []
  },
  {
    emoji: '🇿🇦',
    description: 'flag: South Africa',
    category: 'Flags',
    aliases: ['south_africa'],
    tags: []
  },
  {
    emoji: '🇿🇲',
    description: 'flag: Zambia',
    category: 'Flags',
    aliases: ['zambia'],
    tags: []
  },
  {
    emoji: '🇿🇼',
    description: 'flag: Zimbabwe',
    category: 'Flags',
    aliases: ['zimbabwe'],
    tags: []
  },
  {
    emoji: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    description: 'flag: England',
    category: 'Flags',
    aliases: ['england'],
    tags: []
  },
  {
    emoji: '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
    description: 'flag: Scotland',
    category: 'Flags',
    aliases: ['scotland'],
    tags: []
  },
  {
    emoji: '🏴󠁧󠁢󠁷󠁬󠁳󠁿',
    description: 'flag: Wales',
    category: 'Flags',
    aliases: ['wales'],
    tags: []
  }
]

export default emojis

export type Emoji = (typeof emojis)[number]
